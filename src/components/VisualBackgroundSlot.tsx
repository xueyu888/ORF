import { type CSSProperties } from "react";
import type { VisualBackgroundCrop } from "../domain/settings/visualBackgrounds";

type VisualBackgroundSlotProps = {
  crop: VisualBackgroundCrop;
  frameClassName: string;
  imageClassName?: string;
  imageUrl: string | null;
  loading?: "eager" | "lazy";
  onImageError?: () => void;
};

export function VisualBackgroundSlot({
  crop,
  frameClassName,
  imageClassName,
  imageUrl,
  loading = "eager",
  onImageError,
}: VisualBackgroundSlotProps) {
  if (!imageUrl) return null;

  return (
    <span className={["orf-visual-bg-slot", frameClassName].filter(Boolean).join(" ")} aria-hidden="true">
      <img
        className={["orf-visual-bg-slot-image", imageClassName].filter(Boolean).join(" ")}
        src={imageUrl}
        alt=""
        aria-hidden="true"
        draggable={false}
        loading={loading}
        decoding="async"
        onError={onImageError}
        style={visualBackgroundSlotStyle(crop)}
      />
    </span>
  );
}

function visualBackgroundSlotStyle(crop: VisualBackgroundCrop) {
  return {
    "--orf-visual-bg-center-x": `${crop.centerX * 100}%`,
    "--orf-visual-bg-center-y": `${crop.centerY * 100}%`,
    "--orf-visual-bg-zoom": crop.zoom,
  } as CSSProperties;
}
