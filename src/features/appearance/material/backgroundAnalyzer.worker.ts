import {
  materialAnalysisCanvasSize,
  visibleBackgroundSourceRect,
  type MaterialViewportSize,
} from "./backgroundViewport";
import type { VisualBackgroundCrop } from "../../../domain/settings/visualBackgrounds";

type AnalyzeRequest = {
  id: string;
  imageUrl: string;
  crop: VisualBackgroundCrop;
  viewport: MaterialViewportSize;
};

type AnalyzeSuccess = {
  id: string;
  analysis: {
    averageRgb: [number, number, number];
    tintRgb: [number, number, number];
    saturation: number;
    luminanceP10: number;
    luminanceP50: number;
    luminanceP90: number;
    dynamicRange: number;
    darkPixelShare: number;
    lightPixelShare: number;
    edgeDensity: number;
    complexity: number;
  };
};

type AnalyzeFailure = { id: string; error: string };

type CachedBackgroundBitmap = {
  activeReaders: number;
  bitmap: Promise<ImageBitmap>;
  lastUsedAt: number;
};

const backgroundBitmapCacheLimit = 4;
const backgroundBitmapCache = new Map<string, CachedBackgroundBitmap>();

const workerScope = self as unknown as {
  addEventListener: (type: "message", listener: (event: MessageEvent<AnalyzeRequest>) => void) => void;
  postMessage: (message: AnalyzeSuccess | AnalyzeFailure) => void;
};

function clampUnit(value: number) {
  return Math.max(0, Math.min(1, value));
}

function disposeBackgroundBitmap(entry: CachedBackgroundBitmap) {
  void entry.bitmap.then((bitmap) => bitmap.close()).catch(() => undefined);
}

function trimBackgroundBitmapCache() {
  while (backgroundBitmapCache.size > backgroundBitmapCacheLimit) {
    const candidate = [...backgroundBitmapCache.entries()]
      .filter(([, entry]) => entry.activeReaders === 0)
      .sort(([, left], [, right]) => left.lastUsedAt - right.lastUsedAt)[0];
    if (!candidate) return;
    const [url, entry] = candidate;
    backgroundBitmapCache.delete(url);
    disposeBackgroundBitmap(entry);
  }
}

async function loadBackgroundBitmap(imageUrl: string) {
  const response = await fetch(imageUrl, { credentials: "same-origin" });
  if (!response.ok) throw new Error(`background request failed: ${response.status}`);
  return createImageBitmap(await response.blob());
}

async function acquireBackgroundBitmap(imageUrl: string) {
  let entry = backgroundBitmapCache.get(imageUrl);
  if (!entry) {
    entry = {
      activeReaders: 0,
      bitmap: loadBackgroundBitmap(imageUrl),
      lastUsedAt: Date.now(),
    };
    backgroundBitmapCache.set(imageUrl, entry);
  }
  entry.activeReaders += 1;
  entry.lastUsedAt = Date.now();
  const acquiredEntry = entry;
  trimBackgroundBitmapCache();

  try {
    const bitmap = await acquiredEntry.bitmap;
    return {
      bitmap,
      release() {
        acquiredEntry.activeReaders = Math.max(0, acquiredEntry.activeReaders - 1);
        acquiredEntry.lastUsedAt = Date.now();
        trimBackgroundBitmapCache();
      },
    };
  } catch (error) {
    acquiredEntry.activeReaders = Math.max(0, acquiredEntry.activeReaders - 1);
    if (backgroundBitmapCache.get(imageUrl) === acquiredEntry) backgroundBitmapCache.delete(imageUrl);
    throw error;
  }
}

function srgbChannelToLinear(value: number) {
  const channel = clampUnit(value / 255);
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function linearChannelToSrgb(value: number) {
  const channel = clampUnit(value);
  const encoded = channel <= 0.0031308 ? 12.92 * channel : 1.055 * channel ** (1 / 2.4) - 0.055;
  return Math.round(clampUnit(encoded) * 255);
}

function linearRgbToOklab(red: number, green: number, blue: number) {
  const l = 0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue;
  const m = 0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue;
  const s = 0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue;
  const lRoot = Math.cbrt(l);
  const mRoot = Math.cbrt(m);
  const sRoot = Math.cbrt(s);
  return [
    0.2104542553 * lRoot + 0.793617785 * mRoot - 0.0040720468 * sRoot,
    1.9779984951 * lRoot - 2.428592205 * mRoot + 0.4505937099 * sRoot,
    0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.808675766 * sRoot,
  ] as const;
}

function oklabToLinearRgb(lightness: number, a: number, b: number) {
  const lRoot = lightness + 0.3963377774 * a + 0.2158037573 * b;
  const mRoot = lightness - 0.1055613458 * a - 0.0638541728 * b;
  const sRoot = lightness - 0.0894841775 * a - 1.291485548 * b;
  const l = lRoot ** 3;
  const m = mRoot ** 3;
  const s = sRoot ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ] as const;
}

function percentile(sorted: readonly number[], fraction: number) {
  if (sorted.length === 0) return 0.5;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * fraction)));
  return sorted[index] ?? 0.5;
}

function analyzePixels(imageData: ImageData) {
  const { data, width, height } = imageData;
  const pixelCount = Math.max(1, width * height);
  const luminances = new Array<number>(pixelCount);
  const linearLuminances = new Float32Array(pixelCount);
  let redTotal = 0;
  let greenTotal = 0;
  let blueTotal = 0;
  let oklabLightnessTotal = 0;
  let oklabATotal = 0;
  let oklabBTotal = 0;
  let saturationTotal = 0;
  let darkPixels = 0;
  let lightPixels = 0;

  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const offset = pixel * 4;
    const alpha = (data[offset + 3] ?? 255) / 255;
    const red = (data[offset] ?? 128) * alpha + 128 * (1 - alpha);
    const green = (data[offset + 1] ?? 128) * alpha + 128 * (1 - alpha);
    const blue = (data[offset + 2] ?? 128) * alpha + 128 * (1 - alpha);
    const linearRed = srgbChannelToLinear(red);
    const linearGreen = srgbChannelToLinear(green);
    const linearBlue = srgbChannelToLinear(blue);
    const luminance = 0.2126 * linearRed + 0.7152 * linearGreen + 0.0722 * linearBlue;
    const [okLightness, okA, okB] = linearRgbToOklab(linearRed, linearGreen, linearBlue);
    const maximum = Math.max(red, green, blue) / 255;
    const minimum = Math.min(red, green, blue) / 255;
    const saturation = maximum <= 0 ? 0 : (maximum - minimum) / maximum;

    luminances[pixel] = luminance;
    linearLuminances[pixel] = luminance;
    redTotal += linearRed;
    greenTotal += linearGreen;
    blueTotal += linearBlue;
    oklabLightnessTotal += okLightness;
    oklabATotal += okA;
    oklabBTotal += okB;
    saturationTotal += saturation;
    if (luminance < 0.08) darkPixels += 1;
    if (luminance > 0.82) lightPixels += 1;
  }

  luminances.sort((first, second) => first - second);
  const luminanceP10 = percentile(luminances, 0.1);
  const luminanceP50 = percentile(luminances, 0.5);
  const luminanceP90 = percentile(luminances, 0.9);
  const dynamicRange = clampUnit(luminanceP90 - luminanceP10);
  let edgeDifference = 0;
  let edgeCount = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const current = linearLuminances[index] ?? 0;
      if (x + 1 < width) {
        edgeDifference += Math.abs(current - (linearLuminances[index + 1] ?? current));
        edgeCount += 1;
      }
      if (y + 1 < height) {
        edgeDifference += Math.abs(current - (linearLuminances[index + width] ?? current));
        edgeCount += 1;
      }
    }
  }
  const edgeDensity = clampUnit((edgeDifference / Math.max(1, edgeCount)) / 0.22);
  const saturation = clampUnit(saturationTotal / pixelCount);
  const averageLinear = [redTotal / pixelCount, greenTotal / pixelCount, blueTotal / pixelCount] as const;
  const tintLinear = oklabToLinearRgb(oklabLightnessTotal / pixelCount, oklabATotal / pixelCount, oklabBTotal / pixelCount);

  return {
    averageRgb: averageLinear.map(linearChannelToSrgb) as [number, number, number],
    tintRgb: tintLinear.map(linearChannelToSrgb) as [number, number, number],
    saturation,
    luminanceP10,
    luminanceP50,
    luminanceP90,
    dynamicRange,
    darkPixelShare: darkPixels / pixelCount,
    lightPixelShare: lightPixels / pixelCount,
    edgeDensity,
    complexity: clampUnit(dynamicRange * 0.55 + edgeDensity * 0.35 + saturation * 0.1),
  };
}

async function analyzeBackground(request: AnalyzeRequest) {
  const sourceBitmap = await acquireBackgroundBitmap(request.imageUrl);
  const { bitmap } = sourceBitmap;
  try {
    const source = visibleBackgroundSourceRect(
      { width: bitmap.width, height: bitmap.height },
      request.viewport,
      request.crop,
    );
    const canvasSize = materialAnalysisCanvasSize(request.viewport);
    const canvas = new OffscreenCanvas(canvasSize.width, canvasSize.height);
    const context = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
    if (!context) throw new Error("2d canvas unavailable");
    context.drawImage(
      bitmap,
      source.x,
      source.y,
      source.width,
      source.height,
      0,
      0,
      canvasSize.width,
      canvasSize.height,
    );
    return analyzePixels(context.getImageData(0, 0, canvasSize.width, canvasSize.height));
  } finally {
    sourceBitmap.release();
  }
}

workerScope.addEventListener("message", (event) => {
  const request = event.data;
  void analyzeBackground(request)
    .then((analysis) => workerScope.postMessage({ id: request.id, analysis }))
    .catch((error) => workerScope.postMessage({
      id: request.id,
      error: error instanceof Error ? error.message : "background analysis failed",
    }));
});
