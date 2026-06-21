import {
  defaultVisualBackgroundPlacement,
  normalizeVisualBackgroundPlacement,
  type VisualBackgroundPlacement,
} from "../domain/settings/visualBackgrounds";

const storageKey = "orf.loginBackgroundPreview.v1";
const previewMaxWidth = 1800;
const previewMaxHeight = 1200;

export type CachedLoginBackgroundPreview = {
  dataUrl: string;
  placement: VisualBackgroundPlacement;
  updatedAt: string;
  userId: string;
};

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("login background preview load failed"));
    image.src = src;
  });
}

function canvasSize(image: HTMLImageElement) {
  const width = image.naturalWidth || previewMaxWidth;
  const height = image.naturalHeight || previewMaxHeight;
  const ratio = Math.min(1, previewMaxWidth / width, previewMaxHeight / height);
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}

export function readCachedLoginBackgroundPreview(): CachedLoginBackgroundPreview | null {
  if (!canUseStorage()) return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedLoginBackgroundPreview>;
    if (!parsed.userId || !parsed.dataUrl || !parsed.updatedAt) return null;
    return {
      userId: parsed.userId,
      dataUrl: parsed.dataUrl,
      updatedAt: parsed.updatedAt,
      placement: normalizeVisualBackgroundPlacement(parsed.placement ?? defaultVisualBackgroundPlacement),
    };
  } catch {
    return null;
  }
}

export async function cacheLoginBackgroundPreview(input: {
  imageUrl: string;
  placement: VisualBackgroundPlacement;
  userId: string;
}) {
  if (!canUseStorage()) return;
  const image = await loadImage(input.imageUrl);
  const size = canvasSize(image);
  const canvas = window.document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d");
  if (!context) return;
  context.drawImage(image, 0, 0, size.width, size.height);
  const preview: CachedLoginBackgroundPreview = {
    userId: input.userId,
    dataUrl: canvas.toDataURL("image/jpeg", 0.86),
    updatedAt: new Date().toISOString(),
    placement: normalizeVisualBackgroundPlacement(input.placement),
  };
  window.localStorage.setItem(storageKey, JSON.stringify(preview));
}

export function clearCachedLoginBackgroundPreview(userId?: string | null) {
  if (!canUseStorage()) return;
  const current = readCachedLoginBackgroundPreview();
  if (!userId || current?.userId === userId) {
    window.localStorage.removeItem(storageKey);
  }
}
