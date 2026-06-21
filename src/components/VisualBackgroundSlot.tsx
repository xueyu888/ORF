import { type CSSProperties } from "react";
import type { VisualBackgroundPlacement } from "../domain/settings/visualBackgrounds";

type VisualBackgroundSlotProps = {
  frameClassName: string;
  imageClassName?: string;
  imageFilter?: string;
  imageUrl: string | null;
  loading?: "eager" | "lazy";
  onImageError?: () => void;
  placement: VisualBackgroundPlacement;
};

export function VisualBackgroundSlot({
  frameClassName,
  imageClassName,
  imageFilter,
  imageUrl,
  loading = "eager",
  onImageError,
  placement,
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
        style={visualBackgroundSlotStyle(placement, imageFilter)}
      />
    </span>
  );
}

function visualBackgroundSlotStyle(placement: VisualBackgroundPlacement, imageFilter?: string) {
  const effectiveScale = Math.max(1, placement.scale);
  const panX = (placement.offsetX * (effectiveScale - 1)) / 2;
  const panY = (placement.offsetY * (effectiveScale - 1)) / 2;

  return {
    "--orf-visual-bg-effective-scale": effectiveScale,
    "--orf-visual-bg-filter": imageFilter,
    "--orf-visual-bg-object-x": `${50 + placement.offsetX / 2}%`,
    "--orf-visual-bg-object-y": `${50 + placement.offsetY / 2}%`,
    "--orf-visual-bg-pan-x": `${panX}%`,
    "--orf-visual-bg-pan-y": `${panY}%`,
    "--orf-visual-bg-requested-scale": placement.scale,
  } as CSSProperties;
}
