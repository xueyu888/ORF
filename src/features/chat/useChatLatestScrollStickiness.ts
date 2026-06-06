import { type RefObject, useCallback, useEffect, useRef } from "react";
import { isChatFeedNearLatest, scrollChatFeedToLatest } from "./chatFeedScroll";

type UseChatLatestScrollStickinessInput<T extends HTMLElement> = {
  contentSelector: string;
  disabled?: boolean;
  onAfterScrollToLatest?: () => void;
  scrollKey: unknown;
  scrollRef: RefObject<T | null>;
};

export function useChatLatestScrollStickiness<T extends HTMLElement>({
  contentSelector,
  disabled,
  onAfterScrollToLatest,
  scrollKey,
  scrollRef,
}: UseChatLatestScrollStickinessInput<T>) {
  const pendingLatestScrollRef = useRef<ScrollBehavior | null>(null);
  const shouldStickToLatestRef = useRef(true);

  const scrollToLatest = useCallback((behavior: ScrollBehavior) => {
    if (scrollChatFeedToLatest(scrollRef.current, behavior)) {
      onAfterScrollToLatest?.();
    }
  }, [onAfterScrollToLatest, scrollRef]);

  const requestScrollToLatest = useCallback((behavior: ScrollBehavior = "smooth") => {
    shouldStickToLatestRef.current = true;
    pendingLatestScrollRef.current = behavior;
    window.requestAnimationFrame(() => scrollToLatest(behavior));
  }, [scrollToLatest]);

  const setFollowingLatest = useCallback((following: boolean) => {
    shouldStickToLatestRef.current = following;
  }, []);

  const isFollowingLatest = useCallback(() => shouldStickToLatestRef.current, []);

  const isLatestScrollPending = useCallback(() => Boolean(pendingLatestScrollRef.current), []);

  const handleScroll = useCallback(() => {
    const nearLatest = isChatFeedNearLatest(scrollRef.current);
    if (!pendingLatestScrollRef.current) shouldStickToLatestRef.current = nearLatest;
    return nearLatest;
  }, [scrollRef]);

  useEffect(() => {
    const behavior = pendingLatestScrollRef.current;
    if (!behavior || disabled) return undefined;
    let cancelled = false;
    let clearTimer: number | null = null;
    let remainingAttempts = behavior === "auto" ? 3 : 1;
    const scrollLatest = () => {
      if (cancelled) return;
      scrollToLatest(behavior);
      remainingAttempts -= 1;
      if (remainingAttempts > 0) {
        window.requestAnimationFrame(scrollLatest);
        return;
      }
      if (pendingLatestScrollRef.current === behavior) {
        if (behavior === "smooth") {
          clearTimer = window.setTimeout(() => {
            if (pendingLatestScrollRef.current === behavior) pendingLatestScrollRef.current = null;
          }, 360);
        } else {
          pendingLatestScrollRef.current = null;
        }
      }
    };
    window.requestAnimationFrame(scrollLatest);
    return () => {
      cancelled = true;
      if (clearTimer !== null) window.clearTimeout(clearTimer);
    };
  }, [disabled, scrollKey, scrollRef, scrollToLatest]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element || typeof ResizeObserver === "undefined" || typeof MutationObserver === "undefined") return undefined;

    const observedContent = new Set<Element>();
    let frame: number | null = null;
    const resizeObserver = new ResizeObserver(() => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        frame = null;
        if (disabled) return;
        if (!pendingLatestScrollRef.current && !shouldStickToLatestRef.current) return;
        if (scrollChatFeedToLatest(element, "auto")) {
          onAfterScrollToLatest?.();
        }
      });
    });
    const observeContent = () => {
      const nextContent = new Set(Array.from(element.querySelectorAll(contentSelector)));
      for (const content of observedContent) {
        if (!nextContent.has(content)) {
          resizeObserver.unobserve(content);
          observedContent.delete(content);
        }
      }
      for (const content of nextContent) {
        if (!observedContent.has(content)) {
          observedContent.add(content);
          resizeObserver.observe(content);
        }
      }
    };
    observeContent();
    const mutationObserver = new MutationObserver(observeContent);
    mutationObserver.observe(element, { childList: true, subtree: true });
    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      mutationObserver.disconnect();
      resizeObserver.disconnect();
      observedContent.clear();
    };
  }, [contentSelector, disabled, onAfterScrollToLatest, scrollRef]);

  return {
    handleScroll,
    isFollowingLatest,
    isLatestScrollPending,
    requestScrollToLatest,
    setFollowingLatest,
  };
}
