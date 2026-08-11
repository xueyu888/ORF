import { type RefObject, useEffect } from "react";

const chatBackGestureEdgeWidthPx = 28;
const chatBackGestureLockDistancePx = 10;
const chatBackGestureCommitDistancePx = 72;
const chatBackGestureMaxDurationMs = 900;

interface UseChatMobileBackGestureOptions {
  enabled: boolean;
  onBack: () => void;
  rootRef: RefObject<HTMLElement | null>;
}

interface ChatBackGesturePointerState {
  horizontal: boolean | null;
  pointerId: number;
  startedAt: number;
  startX: number;
  startY: number;
}

function isChatBackGestureInteractiveTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(
    target.closest("input, textarea, select, [contenteditable], [role='slider'], [data-chat-back-gesture-ignore]"),
  );
}

function resetChatBackGesture(root: HTMLElement) {
  root.removeAttribute("data-chat-back-gesture");
  root.style.removeProperty("--orf-chat-back-gesture-opacity");
  root.style.removeProperty("--orf-chat-back-gesture-offset");
  root.style.removeProperty("--orf-chat-back-gesture-scale");
}

function renderChatBackGesture(root: HTMLElement, distance: number) {
  const progress = Math.min(Math.max(distance / chatBackGestureCommitDistancePx, 0), 1);
  root.dataset.chatBackGesture = "tracking";
  root.style.setProperty("--orf-chat-back-gesture-opacity", String(Math.min(0.96, 0.24 + progress * 0.72)));
  root.style.setProperty("--orf-chat-back-gesture-offset", `${Math.round(progress * 15)}px`);
  root.style.setProperty("--orf-chat-back-gesture-scale", String(0.82 + progress * 0.18));
}

export function useChatMobileBackGesture({ enabled, onBack, rootRef }: UseChatMobileBackGestureOptions) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !enabled) {
      if (root) resetChatBackGesture(root);
      return undefined;
    }

    let pointer: ChatBackGesturePointerState | null = null;

    const finishGesture = (event: PointerEvent, cancelled = false) => {
      if (!pointer || event.pointerId !== pointer.pointerId) return;
      const distanceX = event.clientX - pointer.startX;
      const elapsed = performance.now() - pointer.startedAt;
      const shouldGoBack = !cancelled
        && pointer.horizontal === true
        && distanceX >= chatBackGestureCommitDistancePx
        && elapsed <= chatBackGestureMaxDurationMs;
      pointer = null;
      resetChatBackGesture(root);
      if (shouldGoBack) onBack();
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!pointer || event.pointerId !== pointer.pointerId) return;
      const distanceX = event.clientX - pointer.startX;
      const distanceY = event.clientY - pointer.startY;
      const absoluteX = Math.abs(distanceX);
      const absoluteY = Math.abs(distanceY);

      if (pointer.horizontal === null && Math.max(absoluteX, absoluteY) >= chatBackGestureLockDistancePx) {
        pointer.horizontal = distanceX > 0 && absoluteX > absoluteY * 1.15;
        if (!pointer.horizontal) {
          pointer = null;
          resetChatBackGesture(root);
          return;
        }
      }

      if (pointer.horizontal) {
        event.preventDefault();
        renderChatBackGesture(root, distanceX);
      }
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (
        !event.isPrimary
        || event.pointerType !== "touch"
        || event.clientX > chatBackGestureEdgeWidthPx
        || isChatBackGestureInteractiveTarget(event.target)
      ) return;

      pointer = {
        horizontal: null,
        pointerId: event.pointerId,
        startedAt: performance.now(),
        startX: event.clientX,
        startY: event.clientY,
      };
    };

    const handlePointerUp = (event: PointerEvent) => finishGesture(event);
    const handlePointerCancel = (event: PointerEvent) => finishGesture(event, true);

    root.addEventListener("pointerdown", handlePointerDown, { passive: true });
    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", handlePointerUp, { passive: true });
    window.addEventListener("pointercancel", handlePointerCancel, { passive: true });

    return () => {
      root.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
      resetChatBackGesture(root);
    };
  }, [enabled, onBack, rootRef]);
}
