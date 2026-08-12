export const chatViewportLayoutStableMs = 240;
export const chatViewportLayoutMaxWaitMs = 10_000;

export type ChatViewportLayoutSubscription = (listener: () => void) => () => void;

export function chatViewportHasPendingLayout(element: HTMLElement | null) {
  if (!element) return false;
  const hasLoadingCard = Boolean(element.querySelector(".orf-chat-reference-card[aria-busy='true']"));
  const hasLoadingImage = Array.from(element.querySelectorAll<HTMLImageElement>("img"))
    .some((image) => {
      if (image.complete) return false;
      const bounds = image.getBoundingClientRect();
      return bounds.width > 0 && bounds.height === 0;
    });
  return hasLoadingCard || hasLoadingImage;
}

export function observeChatViewportLayout(
  element: HTMLElement,
  contentSelector: string,
  onLayoutChanged: () => void,
) {
  const observedContent = new Set<Element>();
  const resizeObserver = typeof ResizeObserver === "undefined"
    ? null
    : new ResizeObserver(onLayoutChanged);

  const syncObservedContent = () => {
    const nextContent = new Set(Array.from(element.querySelectorAll(contentSelector)));
    for (const content of observedContent) {
      if (nextContent.has(content)) continue;
      resizeObserver?.unobserve(content);
      observedContent.delete(content);
    }
    for (const content of nextContent) {
      if (observedContent.has(content)) continue;
      observedContent.add(content);
      resizeObserver?.observe(content);
    }
  };

  syncObservedContent();
  const mutationObserver = typeof MutationObserver === "undefined"
    ? null
    : new MutationObserver(() => {
        syncObservedContent();
        onLayoutChanged();
      });
  mutationObserver?.observe(element, { childList: true, subtree: true });
  window.addEventListener("resize", onLayoutChanged);

  return () => {
    mutationObserver?.disconnect();
    resizeObserver?.disconnect();
    observedContent.clear();
    window.removeEventListener("resize", onLayoutChanged);
  };
}

export function runChatViewportLayoutIntent(input: {
  element: HTMLElement | null;
  onDone: () => void;
  onInvalidated?: () => void;
  restore: () => boolean;
  settled?: () => boolean;
  subscribeLayoutChanges: ChatViewportLayoutSubscription;
  valid?: () => boolean;
}) {
  let cancelled = false;
  let frame: number | null = null;
  let stableTimer: number | null = null;
  let maxTimer: number | null = null;
  let restoredOnce = false;
  let unsubscribeLayoutChanges: () => void = () => undefined;

  const clearFrame = () => {
    if (frame !== null) window.cancelAnimationFrame(frame);
    frame = null;
  };
  const clearStableTimer = () => {
    if (stableTimer !== null) window.clearTimeout(stableTimer);
    stableTimer = null;
  };
  const cleanup = () => {
    clearFrame();
    clearStableTimer();
    if (maxTimer !== null) window.clearTimeout(maxTimer);
    maxTimer = null;
    unsubscribeLayoutChanges();
  };
  const stop = () => {
    if (cancelled) return;
    cancelled = true;
    cleanup();
  };
  const finish = () => {
    if (cancelled) return;
    stop();
    input.onDone();
  };
  const invalidate = () => {
    if (cancelled) return;
    input.onInvalidated?.();
    stop();
  };
  const scheduleStableFinish = () => {
    clearStableTimer();
    stableTimer = window.setTimeout(() => {
      stableTimer = null;
      if (cancelled) return;
      if (input.valid && !input.valid()) {
        invalidate();
        return;
      }
      if (
        restoredOnce
        && !chatViewportHasPendingLayout(input.element)
        && (input.settled?.() ?? true)
      ) {
        finish();
        return;
      }
      if (!restoredOnce) scheduleRestore();
      scheduleStableFinish();
    }, chatViewportLayoutStableMs);
  };
  const runRestore = () => {
    frame = null;
    if (cancelled) return;
    if (input.valid && !input.valid()) {
      invalidate();
      return;
    }
    restoredOnce = input.restore() || restoredOnce;
    scheduleStableFinish();
  };
  const scheduleRestore = () => {
    if (cancelled) return;
    clearFrame();
    frame = window.requestAnimationFrame(runRestore);
  };
  const handleLayoutChanged = () => {
    scheduleRestore();
    scheduleStableFinish();
  };

  unsubscribeLayoutChanges = input.subscribeLayoutChanges(handleLayoutChanged);
  scheduleRestore();
  maxTimer = window.setTimeout(() => {
    if (cancelled) return;
    if (input.valid && !input.valid()) {
      invalidate();
      return;
    }
    input.restore();
    finish();
  }, chatViewportLayoutMaxWaitMs);

  return stop;
}
