import { type RefObject, useCallback, useEffect, useLayoutEffect, useRef } from "react";
import type { AppAttentionState } from "../interaction/appAttentionState";
import {
  chatFeedViewportModeAfterScroll,
  type ChatFeedViewportMode,
  isChatFeedAtLatest,
  isChatFeedNearLatest,
  scrollChatFeedToLatest,
} from "./chatFeedScroll";
import {
  type ChatScrollCommandKind,
  type ChatScrollEventSource,
  chatScrollProgrammaticAutoSettleFrames,
  chatScrollProgrammaticSmoothSettleMs,
  chatScrollUserIntentTrustMs,
  chatScrollUserScrollKeys,
  classifyChatScrollEvent,
} from "./chatScrollController";

type PendingLatestScroll = {
  behavior: ScrollBehavior;
  token: number;
};

type PendingProgrammaticScroll = {
  kind: ChatScrollCommandKind;
  token: number;
};

export type ChatFeedViewportSnapshot = {
  mode: ChatFeedViewportMode;
  revision: number;
};

export type ChatFeedScrollHandleResult = {
  nearLatest: boolean;
  source: ChatScrollEventSource;
};

type UseChatLatestScrollStickinessInput<T extends HTMLElement> = {
  appAttentionState?: AppAttentionState;
  contentSelector: string;
  disabled?: boolean;
  onAfterScrollToLatest?: () => void;
  scrollKey: unknown;
  scrollRef: RefObject<T | null>;
};

export function useChatLatestScrollStickiness<T extends HTMLElement>({
  appAttentionState,
  contentSelector,
  disabled,
  onAfterScrollToLatest,
  scrollKey,
  scrollRef,
}: UseChatLatestScrollStickinessInput<T>) {
  const appAttentionStateRef = useRef(appAttentionState);
  const latestScrollTokenRef = useRef(0);
  const pendingLatestScrollRef = useRef<PendingLatestScroll | null>(null);
  const pendingProgrammaticScrollRef = useRef<PendingProgrammaticScroll | null>(null);
  const previousScrollTopRef = useRef(0);
  const programmaticClearFrameRef = useRef<number | null>(null);
  const programmaticClearTimerRef = useRef<number | null>(null);
  const programmaticScrollTokenRef = useRef(0);
  const userScrollIntentUntilRef = useRef(0);
  const viewportModeRef = useRef<ChatFeedViewportMode>("followingLatest");
  const viewportRevisionRef = useRef(0);
  appAttentionStateRef.current = appAttentionState;

  const clearProgrammaticClearTimer = useCallback(() => {
    if (programmaticClearTimerRef.current !== null) window.clearTimeout(programmaticClearTimerRef.current);
    programmaticClearTimerRef.current = null;
  }, []);

  const clearProgrammaticClearFrame = useCallback(() => {
    if (programmaticClearFrameRef.current !== null) window.cancelAnimationFrame(programmaticClearFrameRef.current);
    programmaticClearFrameRef.current = null;
  }, []);

  const clearPendingProgrammaticScroll = useCallback((token: number) => {
    if (pendingProgrammaticScrollRef.current?.token === token) {
      pendingProgrammaticScrollRef.current = null;
    }
  }, []);

  const scheduleProgrammaticScrollClear = useCallback((token: number, behavior: ScrollBehavior) => {
    clearProgrammaticClearFrame();
    clearProgrammaticClearTimer();
    if (behavior === "smooth") {
      programmaticClearTimerRef.current = window.setTimeout(
        () => clearPendingProgrammaticScroll(token),
        chatScrollProgrammaticSmoothSettleMs,
      );
      return;
    }

    let remainingFrames = chatScrollProgrammaticAutoSettleFrames;
    const clearAfterFrame = () => {
      remainingFrames -= 1;
      if (remainingFrames <= 0) {
        programmaticClearFrameRef.current = null;
        clearPendingProgrammaticScroll(token);
        return;
      }
      programmaticClearFrameRef.current = window.requestAnimationFrame(clearAfterFrame);
    };
    programmaticClearFrameRef.current = window.requestAnimationFrame(clearAfterFrame);
  }, [clearPendingProgrammaticScroll, clearProgrammaticClearFrame, clearProgrammaticClearTimer]);

  const markProgrammaticScroll = useCallback((kind: ChatScrollCommandKind, behavior: ScrollBehavior = "auto") => {
    const token = programmaticScrollTokenRef.current + 1;
    programmaticScrollTokenRef.current = token;
    pendingProgrammaticScrollRef.current = { kind, token };
    scheduleProgrammaticScrollClear(token, behavior);
  }, [scheduleProgrammaticScrollClear]);

  const runProgrammaticScroll = useCallback(<Result,>(
    kind: ChatScrollCommandKind,
    run: () => Result,
    behavior: ScrollBehavior = "auto",
  ) => {
    markProgrammaticScroll(kind, behavior);
    return run();
  }, [markProgrammaticScroll]);

  const markUserScrollIntent = useCallback(() => {
    if (appAttentionStateRef.current && !appAttentionStateRef.current.activelyViewed) return;
    userScrollIntentUntilRef.current = Date.now() + chatScrollUserIntentTrustMs;
  }, []);

  const classifyCurrentScrollEvent = useCallback((): ChatScrollEventSource => classifyChatScrollEvent({
    activelyViewed: appAttentionStateRef.current?.activelyViewed ?? true,
    now: Date.now(),
    programmatic: Boolean(pendingLatestScrollRef.current || pendingProgrammaticScrollRef.current),
    userIntentUntil: userScrollIntentUntilRef.current,
  }), []);

  const setViewportMode = useCallback((mode: ChatFeedViewportMode, recordIntent = true) => {
    viewportModeRef.current = mode;
    if (recordIntent) viewportRevisionRef.current += 1;
  }, []);

  const scrollToLatest = useCallback((behavior: ScrollBehavior) => {
    return runProgrammaticScroll("latest", () => {
      if (scrollChatFeedToLatest(scrollRef.current, behavior)) {
        previousScrollTopRef.current = scrollRef.current?.scrollTop ?? previousScrollTopRef.current;
        onAfterScrollToLatest?.();
        return true;
      }
      return false;
    }, behavior);
  }, [onAfterScrollToLatest, runProgrammaticScroll, scrollRef]);

  const requestScrollToLatest = useCallback((behavior: ScrollBehavior = "smooth") => {
    const token = latestScrollTokenRef.current + 1;
    latestScrollTokenRef.current = token;
    setViewportMode("followingLatest");
    pendingLatestScrollRef.current = { behavior, token };
    window.requestAnimationFrame(() => {
      if (pendingLatestScrollRef.current?.token === token) scrollToLatest(behavior);
    });
  }, [scrollToLatest, setViewportMode]);

  const setFollowingLatest = useCallback((following: boolean) => {
    setViewportMode(following ? "followingLatest" : "browsingHistory");
    if (!following) {
      latestScrollTokenRef.current += 1;
      pendingLatestScrollRef.current = null;
    }
  }, [setViewportMode]);

  const isFollowingLatest = useCallback(() => viewportModeRef.current === "followingLatest", []);

  const readViewportSnapshot = useCallback((): ChatFeedViewportSnapshot => ({
    mode: viewportModeRef.current,
    revision: viewportRevisionRef.current,
  }), []);

  const isLatestScrollPending = useCallback(() => Boolean(pendingLatestScrollRef.current), []);

  const handleScroll = useCallback((): ChatFeedScrollHandleResult => {
    const element = scrollRef.current;
    const nearLatest = isChatFeedNearLatest(element);
    if (!element) return { nearLatest, source: "ambient" };

    const source = classifyCurrentScrollEvent();
    if (source === "ambient") return { nearLatest, source };

    const previousScrollTop = previousScrollTopRef.current;
    const scrollTop = element.scrollTop;
    const movingAwayFromLatest = scrollTop < previousScrollTop;
    if (source === "user" && movingAwayFromLatest && pendingLatestScrollRef.current) {
      latestScrollTokenRef.current += 1;
      pendingLatestScrollRef.current = null;
    }
    const nextMode = chatFeedViewportModeAfterScroll({
      atLatest: isChatFeedAtLatest(element),
      currentMode: viewportModeRef.current,
      previousScrollTop,
      programmatic: source !== "user",
      scrollTop,
    });
    if (source === "user" && scrollTop !== previousScrollTop) {
      setViewportMode(nextMode);
    }
    previousScrollTopRef.current = scrollTop;
    return { nearLatest, source };
  }, [classifyCurrentScrollEvent, scrollRef, setViewportMode]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !chatScrollUserScrollKeys.has(event.key)) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      markUserScrollIntent();
    };

    element.addEventListener("wheel", markUserScrollIntent, { capture: true, passive: true });
    element.addEventListener("touchstart", markUserScrollIntent, { capture: true, passive: true });
    element.addEventListener("pointerdown", markUserScrollIntent, { capture: true });
    window.addEventListener("keydown", handleKeyDown, { capture: true });

    return () => {
      element.removeEventListener("wheel", markUserScrollIntent, { capture: true });
      element.removeEventListener("touchstart", markUserScrollIntent, { capture: true });
      element.removeEventListener("pointerdown", markUserScrollIntent, { capture: true });
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
    };
  }, [markUserScrollIntent, scrollRef]);

  useEffect(() => () => {
    clearProgrammaticClearFrame();
    clearProgrammaticClearTimer();
  }, [clearProgrammaticClearFrame, clearProgrammaticClearTimer]);

  useLayoutEffect(() => {
    const pending = pendingLatestScrollRef.current;
    if (!pending || disabled) return undefined;
    const { behavior, token } = pending;
    let cancelled = false;
    let clearTimer: number | null = null;
    let remainingAttempts = behavior === "auto" ? 3 : 1;
    const scrollLatest = () => {
      if (cancelled) return;
      if (pendingLatestScrollRef.current?.token !== token) return;
      scrollToLatest(behavior);
      remainingAttempts -= 1;
      if (remainingAttempts > 0) {
        window.requestAnimationFrame(scrollLatest);
        return;
      }
      if (pendingLatestScrollRef.current?.token === token) {
        if (behavior === "smooth") {
          clearTimer = window.setTimeout(() => {
            if (pendingLatestScrollRef.current?.token === token) pendingLatestScrollRef.current = null;
          }, chatScrollProgrammaticSmoothSettleMs);
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
        if (disabled || appAttentionStateRef.current?.activelyViewed === false) return;
        if (!pendingLatestScrollRef.current && viewportModeRef.current !== "followingLatest") return;
        if (runProgrammaticScroll("layout-correction", () => scrollChatFeedToLatest(element, "auto"), "auto")) {
          previousScrollTopRef.current = element.scrollTop;
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
  }, [contentSelector, disabled, onAfterScrollToLatest, runProgrammaticScroll, scrollRef]);

  return {
    handleScroll,
    isFollowingLatest,
    isLatestScrollPending,
    readViewportSnapshot,
    requestScrollToLatest,
    runProgrammaticScroll,
    setFollowingLatest,
  };
}
