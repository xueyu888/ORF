import {
  normalizeVisualBackgroundCrop,
  type VisualBackgroundCrop,
} from "../../../domain/settings/visualBackgrounds";

export type MaterialImageSize = { width: number; height: number };
export type MaterialViewportSize = { width: number; height: number };
export type MaterialSourceRect = { x: number; y: number; width: number; height: number };

function positive(value: number) {
  return Number.isFinite(value) ? Math.max(1, value) : 1;
}

export function normalizedMaterialViewport(viewport: MaterialViewportSize): MaterialViewportSize {
  return {
    width: positive(viewport.width),
    height: positive(viewport.height),
  };
}

export function visibleBackgroundSourceRect(
  image: MaterialImageSize,
  viewportInput: MaterialViewportSize,
  cropInput: VisualBackgroundCrop,
): MaterialSourceRect {
  const imageWidth = positive(image.width);
  const imageHeight = positive(image.height);
  const viewport = normalizedMaterialViewport(viewportInput);
  const crop = normalizeVisualBackgroundCrop(cropInput);
  const imageAspect = imageWidth / imageHeight;
  const viewportAspect = viewport.width / viewport.height;

  const coverWidth = imageAspect > viewportAspect ? imageHeight * viewportAspect : imageWidth;
  const coverHeight = imageAspect > viewportAspect ? imageHeight : imageWidth / viewportAspect;
  const sourceWidth = Math.min(imageWidth, coverWidth / crop.zoom);
  const sourceHeight = Math.min(imageHeight, coverHeight / crop.zoom);

  return {
    x: (imageWidth - sourceWidth) * crop.centerX,
    y: (imageHeight - sourceHeight) * crop.centerY,
    width: sourceWidth,
    height: sourceHeight,
  };
}

export function materialViewportAspectBucket(viewportInput: MaterialViewportSize) {
  const viewport = normalizedMaterialViewport(viewportInput);
  return Math.round((viewport.width / viewport.height) * 20) / 20;
}

export function materialAnalysisCanvasSize(viewportInput: MaterialViewportSize, longestEdge = 96) {
  const viewport = normalizedMaterialViewport(viewportInput);
  const aspect = viewport.width / viewport.height;
  if (aspect >= 1) {
    return { width: longestEdge, height: Math.max(12, Math.round(longestEdge / aspect)) };
  }
  return { width: Math.max(12, Math.round(longestEdge * aspect)), height: longestEdge };
}
