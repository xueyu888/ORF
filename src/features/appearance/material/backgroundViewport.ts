import type { VisualBackgroundCrop } from "../../../domain/settings/visualBackgrounds";
import {
  resolveVisualBackgroundCropGeometry,
  type VisualBackgroundGeometryRect,
  type VisualBackgroundGeometrySize,
} from "../background/visualBackgroundCropGeometry";

export type MaterialImageSize = VisualBackgroundGeometrySize;
export type MaterialViewportSize = VisualBackgroundGeometrySize;
export type MaterialSourceRect = VisualBackgroundGeometryRect;

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
  return resolveVisualBackgroundCropGeometry(image, viewportInput, cropInput).sourceRect;
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
