import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

type ResizeSession<T extends HTMLElement> = {
  element: T;
  lastValue: number | null;
  pointerId: number;
  previousCursor: string;
  previousUserSelect: string;
  resolveValue: (deltaX: number) => number;
  startClientX: number;
};

type HorizontalPanelResizeOptions<T extends HTMLElement> = {
  createValueResolver: (element: T) => ((deltaX: number) => number) | null;
  disabled?: boolean;
  keyboardStep?: number;
  onChange: (value: number) => void;
  onCommit?: (value: number) => void;
};

export function useHorizontalPanelResize<T extends HTMLElement>({
  createValueResolver,
  disabled = false,
  keyboardStep = 16,
  onChange,
  onCommit,
}: HorizontalPanelResizeOptions<T>) {
  const [resizing, setResizing] = useState(false);
  const sessionRef = useRef<ResizeSession<T> | null>(null);

  const finishResize = useCallback((commit: boolean) => {
    const session = sessionRef.current;
    if (!session) return;
    sessionRef.current = null;
    if (session.element.hasPointerCapture(session.pointerId)) {
      session.element.releasePointerCapture(session.pointerId);
    }
    document.body.style.cursor = session.previousCursor;
    document.body.style.userSelect = session.previousUserSelect;
    setResizing(false);
    if (commit && session.lastValue !== null) {
      onCommit?.(session.lastValue);
    }
  }, [onCommit]);

  useEffect(() => () => finishResize(false), [finishResize]);

  const onPointerDown = useCallback((event: ReactPointerEvent<T>) => {
    if (disabled || event.button !== 0) return;
    const resolveValue = createValueResolver(event.currentTarget);
    if (!resolveValue) return;

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    sessionRef.current = {
      element: event.currentTarget,
      lastValue: null,
      pointerId: event.pointerId,
      previousCursor: document.body.style.cursor,
      previousUserSelect: document.body.style.userSelect,
      resolveValue,
      startClientX: event.clientX,
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    setResizing(true);
  }, [createValueResolver, disabled]);

  const onPointerMove = useCallback((event: ReactPointerEvent<T>) => {
    const session = sessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    event.preventDefault();
    const nextValue = session.resolveValue(event.clientX - session.startClientX);
    session.lastValue = nextValue;
    onChange(nextValue);
  }, [onChange]);

  const onPointerUp = useCallback((event: ReactPointerEvent<T>) => {
    const session = sessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    event.preventDefault();
    finishResize(true);
  }, [finishResize]);

  const onPointerCancel = useCallback((event: ReactPointerEvent<T>) => {
    const session = sessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    finishResize(true);
  }, [finishResize]);

  const onLostPointerCapture = useCallback((event: ReactPointerEvent<T>) => {
    const session = sessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    finishResize(true);
  }, [finishResize]);

  const onKeyDown = useCallback((event: ReactKeyboardEvent<T>) => {
    if (disabled || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
    const resolveValue = createValueResolver(event.currentTarget);
    if (!resolveValue) return;
    event.preventDefault();
    const nextValue = resolveValue(event.key === "ArrowLeft" ? -keyboardStep : keyboardStep);
    onChange(nextValue);
    onCommit?.(nextValue);
  }, [createValueResolver, disabled, keyboardStep, onChange, onCommit]);

  return {
    handleProps: {
      onKeyDown,
      onLostPointerCapture,
      onPointerCancel,
      onPointerDown,
      onPointerMove,
      onPointerUp,
    },
    resizing,
  };
}
