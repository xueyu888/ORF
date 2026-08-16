import {
  normalizeVisualBackgroundCrop,
  type VisualBackgroundCrop,
} from "../../../domain/settings/visualBackgrounds";

export type VisualBackgroundGeometrySize = {
  height: number;
  width: number;
};

export type VisualBackgroundGeometryRect = VisualBackgroundGeometrySize & {
  x: number;
  y: number;
};

export type VisualBackgroundCropGeometry = {
  imageRect: VisualBackgroundGeometryRect;
  sourceRect: VisualBackgroundGeometryRect;
};

function positiveDimension(value: number) {
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function normalizeSize(size: VisualBackgroundGeometrySize): VisualBackgroundGeometrySize {
  return {
    height: positiveDimension(size.height),
    width: positiveDimension(size.width),
  };
}

export function resolveVisualBackgroundCropGeometry(
  imageInput: VisualBackgroundGeometrySize,
  frameInput: VisualBackgroundGeometrySize,
  cropInput: VisualBackgroundCrop,
): VisualBackgroundCropGeometry {
  const image = normalizeSize(imageInput);
  const frame = normalizeSize(frameInput);
  const crop = normalizeVisualBackgroundCrop(cropInput);
  const coverScale = Math.max(frame.width / image.width, frame.height / image.height);
  const scale = coverScale * crop.zoom;
  const imageRect = {
    height: image.height * scale,
    width: image.width * scale,
    x: (frame.width - image.width * scale) * crop.centerX,
    y: (frame.height - image.height * scale) * crop.centerY,
  };

  return {
    imageRect,
    sourceRect: {
      height: frame.height / scale,
      width: frame.width / scale,
      x: -imageRect.x / scale,
      y: -imageRect.y / scale,
    },
  };
}
