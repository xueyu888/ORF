import { Image, Move, RotateCcw, ZoomIn } from "lucide-react";
import { type PointerEvent, useRef } from "react";
import type { VisualBackgroundImage, VisualBackgroundPlacement } from "../../state/apiClient";

const defaultPlacement: VisualBackgroundPlacement = {
  positionX: 50,
  positionY: 50,
  scale: 1,
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function normalizeBackgroundPlacement(placement: VisualBackgroundPlacement | null | undefined): VisualBackgroundPlacement {
  return {
    positionX: clamp(placement?.positionX ?? defaultPlacement.positionX, 0, 100),
    positionY: clamp(placement?.positionY ?? defaultPlacement.positionY, 0, 100),
    scale: clamp(placement?.scale ?? defaultPlacement.scale, 1, 3),
  };
}

export function BackgroundPlacementEditor({
  disabled = false,
  image,
  placement,
  previewClassName = "",
  onChange,
}: {
  disabled?: boolean;
  image: VisualBackgroundImage | null;
  placement: VisualBackgroundPlacement;
  previewClassName?: string;
  onChange: (placement: VisualBackgroundPlacement) => void;
}) {
  const dragRef = useRef<{ x: number; y: number; placement: VisualBackgroundPlacement } | null>(null);
  const safePlacement = normalizeBackgroundPlacement(placement);

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (disabled || !image) {
      return;
    }
    dragRef.current = {
      x: event.clientX,
      y: event.clientY,
      placement: safePlacement,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || disabled || !image) {
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    onChange({
      ...safePlacement,
      positionX: clamp(drag.placement.positionX + ((event.clientX - drag.x) / Math.max(1, rect.width)) * 100, 0, 100),
      positionY: clamp(drag.placement.positionY + ((event.clientY - drag.y) / Math.max(1, rect.height)) * 100, 0, 100),
    });
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <div className="orf-background-placement-editor">
      <div
        className={["orf-background-placement-preview", previewClassName].filter(Boolean).join(" ")}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {image ? (
          <img
            src={image.url}
            alt=""
            draggable={false}
            style={{
              objectPosition: `${safePlacement.positionX}% ${safePlacement.positionY}%`,
              transform: `scale(${safePlacement.scale})`,
            }}
          />
        ) : (
          <div className="orf-background-placement-empty">
            <Image className="h-5 w-5" />
          </div>
        )}
        {image && (
          <div className="orf-background-placement-handle">
            <Move className="h-4 w-4" />
          </div>
        )}
      </div>
      <div className="orf-background-placement-toolbar">
        <ZoomIn className="h-4 w-4" />
        <input
          type="range"
          min="1"
          max="3"
          step="0.05"
          value={safePlacement.scale}
          disabled={disabled || !image}
          onChange={(event) => onChange({ ...safePlacement, scale: Number(event.target.value) })}
        />
        <button
          type="button"
          className="orf-background-placement-reset"
          disabled={disabled || !image}
          title="重置位置和缩放"
          aria-label="重置位置和缩放"
          onClick={() => onChange(defaultPlacement)}
        >
          <RotateCcw className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
