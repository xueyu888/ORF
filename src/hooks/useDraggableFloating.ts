import { type CSSProperties, type PointerEvent as ReactPointerEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

type DragPoint = {
  x: number;
  y: number;
};

type DragState = {
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  rect: DOMRect;
};

type DraggableFloatingOptions = {
  disabled?: boolean;
  resetKey?: string | number | null;
};

const viewportMargin = 8;
const ignoredSelector = "button, input, textarea, select, a, [data-drag-ignore='true']";

export function useDraggableFloating<T extends HTMLElement>({ disabled = false, resetKey }: DraggableFloatingOptions = {}) {
  const elementRef = useRef<T | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const offsetRef = useRef<DragPoint>({ x: 0, y: 0 });
  const [offset, setOffset] = useState<DragPoint>({ x: 0, y: 0 });

  useEffect(() => {
    offsetRef.current = { x: 0, y: 0 };
    setOffset({ x: 0, y: 0 });
  }, [resetKey]);

  useEffect(() => {
    offsetRef.current = offset;
  }, [offset]);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (disabled || event.button !== 0) {
        return;
      }

      const target = event.target as HTMLElement | null;
      if (target?.closest(ignoredSelector)) {
        return;
      }

      const element = elementRef.current;
      if (!element) {
        return;
      }

      dragStateRef.current = {
        startX: event.clientX,
        startY: event.clientY,
        originX: offsetRef.current.x,
        originY: offsetRef.current.y,
        rect: element.getBoundingClientRect(),
      };
      document.body.dataset.draggingFloating = "true";
      event.preventDefault();
    },
    [disabled],
  );

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState) {
        return;
      }

      const desiredDeltaX = event.clientX - dragState.startX;
      const desiredDeltaY = event.clientY - dragState.startY;
      const minDeltaX = viewportMargin - dragState.rect.left;
      const maxDeltaX = window.innerWidth - viewportMargin - dragState.rect.right;
      const minDeltaY = viewportMargin - dragState.rect.top;
      const maxDeltaY = window.innerHeight - viewportMargin - dragState.rect.bottom;
      const deltaX = clamp(desiredDeltaX, minDeltaX, maxDeltaX);
      const deltaY = clamp(desiredDeltaY, minDeltaY, maxDeltaY);

      setOffset({
        x: dragState.originX + deltaX,
        y: dragState.originY + deltaY,
      });
    };

    const handlePointerUp = () => {
      dragStateRef.current = null;
      delete document.body.dataset.draggingFloating;
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);

    return () => {
      if (dragStateRef.current) {
        dragStateRef.current = null;
        delete document.body.dataset.draggingFloating;
      }
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, []);

  const style = useMemo<CSSProperties>(
    () => ({
      transform: `translate3d(${offset.x}px, ${offset.y}px, 0)`,
    }),
    [offset],
  );

  return {
    ref: elementRef,
    style,
    handleProps: {
      onPointerDown,
    },
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
