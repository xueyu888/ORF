import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ApiError,
  getChatMessageContext,
  getChatMessages,
  getChatUnreadTarget,
  markChatChannelReadRequest,
  setChatChannelUnreadRequest,
} from "../../state/apiClient";
import type { ChatChannel, ChatMessage } from "../../types/orf";
import {
  type ChatFeedViewportMode,
  isChatFeedNearOldest,
  isChatFeedMessagePositioned,
  isChatFeedUnreadPositioned,
  readChatFeedScrollAnchor,
  restoreChatFeedScrollAnchor,
  scrollChatFeedToMessage,
  scrollChatFeedToUnread,
  setChatFeedScrollTopInstant,
} from "./chatFeedScroll";
import {
  type UnreadAnchor,
  applyFeedMessage,
  buildUnreadAnchor,
  type ChatFeedWindowKind,
  type ChatUnreadJumpTarget,
  chatMessagePageSize,
  createFeedSnapshot,
  currentMembership,
  hasMainFeedUnread,
  markPendingChatMessageFailed,
  markPendingChatMessageSending,
  isFreshFeedSnapshot,
  prependOlderFeedMessages,
  promoteReconciledLatestWindow,
  reconcileFeedLatestWindow,
  rememberFeedScroll,
  removeMessageById,
  replaceFeedMessages,
  replacePendingMessage,
  shouldPreserveFeedWindow,
  updatePendingMessageDelivery,
  upsertChannelMessage,
} from "./chatModels";
import { chatReadReceiptStableMs, selectChatReadThroughCandidate } from "./chatReadObserver";
import { useChatLatestScrollStickiness } from "./useChatLatestScrollStickiness";
import type { AppAttentionState } from "../interaction/appAttentionState";
import { chatFeedSessionPrefetchRequests, chatFeedSessionSnapshots } from "./chatFeedSessionCache";
import {
  clearChatFeedReadingPosition,
  type ChatFeedReadingPosition,
  readChatFeedReadingPosition,
  rememberChatLastChannel,
  rememberChatFeedReadingPosition,
} from "./chatFeedReadingPosition";
import { shouldRecordChatFeedReadingPosition } from "./chatScrollController";
import { resolveChatFeedOpenIntent } from "./chatFeedOpenIntent";
import {
  runChatViewportLayoutIntent,
} from "./chatViewportLayout";

export type ChatFeedThreadTarget = {
  focusMessageId: string;
  rootMessageId: string;
};

type UseChatFeedStateInput = {
  activeChannel: ChatChannel | null;
  appAttentionState: AppAttentionState;
  currentUserId?: string;
  notify: (message: string) => void;
  onChannelUpdate: (channel: ChatChannel) => void;
  onRequestedMessageConsumed: () => void;
  onRequestedMessageLocated: (messageId: string) => void;
  onRequestedMessageUnavailable: () => void;
  onRequestedMessageRedirect: (messageId: string) => void;
  onThreadTarget: (target: ChatFeedThreadTarget) => void;
  onUnreadSummaryRefresh: () => Promise<void>;
  requestedMessageId: string | null;
};

type RememberActiveFeedScrollOptions = {
  persistReadingPosition?: boolean;
};

type PendingUnreadScroll = {
  channelId: string;
  messageId?: string | null;
  source: "channel-open" | "jump";
};

type ChatFeedContextWindow = {
  hasNewerMessages: boolean;
  hasOlderMessages: boolean;
  messages: ChatMessage[];
};

function readingPositionFromFeedSnapshot(
  channelId: string,
  snapshot: ReturnType<typeof createFeedSnapshot> | undefined,
): ChatFeedReadingPosition | null {
  if (!snapshot?.scrollAnchor) return null;
  return {
    capturedAt: snapshot.syncedAt ?? new Date(0).toISOString(),
    channelId,
    messageId: snapshot.scrollAnchor.messageId,
    offsetTop: snapshot.scrollAnchor.offsetTop,
    scrollTop: snapshot.scrollTop,
  };
}

export function useChatFeedState({
  activeChannel,
  appAttentionState,
  currentUserId,
  notify,
  onChannelUpdate,
  onRequestedMessageConsumed,
  onRequestedMessageLocated,
  onRequestedMessageUnavailable,
  onRequestedMessageRedirect,
  onThreadTarget,
  onUnreadSummaryRefresh,
  requestedMessageId,
}: UseChatFeedStateInput) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [olderMessagesLoading, setOlderMessagesLoading] = useState(false);
  const [hasNewerMessages, setHasNewerMessages] = useState(false);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [pendingNewMessageCount, setPendingNewMessageCount] = useState(0);
  const [attentionRestoreRevision, setAttentionRestoreRevision] = useState(0);
  const [viewportLayoutIntentRevision, setViewportLayoutIntentRevision] = useState(0);
  const [unreadAnchor, setUnreadAnchor] = useState<UnreadAnchor | null>(null);
  const [feedChannelId, setFeedChannelId] = useState<string | null>(null);
  const activeChannelIdRef = useRef<string | null>(null);
  const appAttentionStateRef = useRef(appAttentionState);
  const inactiveViewportModeRef = useRef<ChatFeedViewportMode | null>(null);
  const currentUserIdRef = useRef<string | undefined>(undefined);
  const contextRequestKeyRef = useRef<string | null>(null);
  const feedCacheRef = useRef(chatFeedSessionSnapshots());
  const lastAttentionActivelyViewedRef = useRef(appAttentionState.activelyViewed);
  const manualUnreadAutoReadSuppressedRef = useRef(false);
  const messageScrollRef = useRef<HTMLDivElement | null>(null);
  const messagesLoadingRef = useRef(false);
  const messagesRef = useRef<ChatMessage[]>([]);
  const olderLoadInFlightRef = useRef(false);
  const pendingReadReceiptRef = useRef<{ channelId: string; messageId: string; timer: number } | null>(null);
  const pendingReadingPositionScrollRef = useRef<ChatFeedReadingPosition | null>(null);
  const pendingUnreadScrollRef = useRef<PendingUnreadScroll | null>(null);
  const prefetchRequestsRef = useRef(chatFeedSessionPrefetchRequests());
  const readMarkInFlightRef = useRef<string | null>(null);
  const unreadAnchorRef = useRef<UnreadAnchor | null>(null);
  const activeChannelId = activeChannel?.id ?? null;
  activeChannelIdRef.current = activeChannelId;
  appAttentionStateRef.current = appAttentionState;
  currentUserIdRef.current = currentUserId;
  unreadAnchorRef.current = unreadAnchor;

  const rememberActiveFeedScroll = useCallback((
    channelId = activeChannelIdRef.current,
    options: RememberActiveFeedScrollOptions = {},
  ) => {
    const element = messageScrollRef.current;
    if (!channelId || !element) return;
    const currentSnapshot = feedCacheRef.current.get(channelId);
    const scrollAnchor = readChatFeedScrollAnchor(element);
    feedCacheRef.current.set(channelId, rememberFeedScroll(currentSnapshot, element.scrollTop, scrollAnchor));
    if (options.persistReadingPosition && scrollAnchor) {
      rememberChatFeedReadingPosition({
        channelId,
        scrollAnchor,
        scrollTop: element.scrollTop,
        userId: currentUserIdRef.current,
      });
    }
  }, []);

  const rememberLatestFeedScroll = useCallback(() => {
    rememberActiveFeedScroll(activeChannelIdRef.current, { persistReadingPosition: true });
  }, [rememberActiveFeedScroll]);

  const {
    handleScroll: handleLatestStickinessScroll,
    isLatestScrollPending,
    readViewportSnapshot,
    requestScrollToLatest: requestLatestStickinessScroll,
    runProgrammaticScroll,
    setFollowingLatest,
    subscribeLayoutChanges,
  } = useChatLatestScrollStickiness({
    appAttentionState,
    contentSelector: ".orf-chat-message-list",
    disabled: messagesLoading,
    onAfterScrollToLatest: rememberLatestFeedScroll,
    scrollKey: messages,
    scrollRef: messageScrollRef,
  });

  const requestScrollToLatest = useCallback((behavior: ScrollBehavior = "smooth") => {
    requestLatestStickinessScroll(behavior);
    setPendingNewMessageCount(0);
  }, [requestLatestStickinessScroll]);

  const readRestorableFeedPosition = useCallback((channelId: string) => (
    readingPositionFromFeedSnapshot(channelId, feedCacheRef.current.get(channelId)) ??
    readChatFeedReadingPosition(currentUserIdRef.current, channelId)
  ), []);

  const applySnapshotToActiveFeed = useCallback((channelId: string, snapshot: ReturnType<typeof createFeedSnapshot>) => {
    if (activeChannelIdRef.current !== channelId) return false;
    setFeedChannelId(channelId);
    setMessages(snapshot.messages);
    setHasNewerMessages(snapshot.hasNewerMessages);
    setHasOlderMessages(snapshot.hasOlderMessages);
    return true;
  }, []);

  const applyContextWindowToFeed = useCallback((
    channelId: string,
    context: ChatFeedContextWindow,
    windowKind: ChatFeedWindowKind,
  ) => {
    const snapshot = replaceFeedMessages(
      feedCacheRef.current.get(channelId),
      context.messages,
      chatMessagePageSize,
      {
        hasNewerMessages: context.hasNewerMessages,
        hasOlderMessages: context.hasOlderMessages,
        windowKind,
      },
    );
    feedCacheRef.current.set(channelId, snapshot);
    setFeedChannelId(channelId);
    setMessages(snapshot.messages);
    setHasNewerMessages(snapshot.hasNewerMessages);
    setHasOlderMessages(snapshot.hasOlderMessages);
    return snapshot;
  }, []);

  const loadLatestWindowForOpen = useCallback(async (
    channelId: string,
    isCancelled: () => boolean,
  ) => {
    const response = await getChatMessages({ channelId, limit: chatMessagePageSize });
    if (isCancelled()) return;
    const snapshot = replaceFeedMessages(feedCacheRef.current.get(channelId), response.messages);
    feedCacheRef.current.set(channelId, snapshot);
    setFeedChannelId(channelId);
    setMessages(snapshot.messages);
    setHasNewerMessages(snapshot.hasNewerMessages);
    setHasOlderMessages(snapshot.hasOlderMessages);
    setFollowingLatest(true);
    requestScrollToLatest("auto");
  }, [requestScrollToLatest, setFollowingLatest]);

  const loadReadingPositionWindow = useCallback(async (
    channelId: string,
    position: ChatFeedReadingPosition,
    isCancelled: () => boolean,
  ) => {
    const response = await getChatMessageContext({ channelId, messageId: position.messageId, limit: chatMessagePageSize });
    if (isCancelled()) return;
    applyContextWindowToFeed(channelId, response, "context");
    pendingReadingPositionScrollRef.current = position;
  }, [applyContextWindowToFeed]);

  const applyMessageToFeed = useCallback((message: ChatMessage) => {
    if (activeChannelIdRef.current === message.channelId) {
      setFeedChannelId(message.channelId);
      setMessages((items) => {
        const snapshot = applyFeedMessage(feedCacheRef.current.get(message.channelId) ?? createFeedSnapshot({ messages: items }), message);
        if (!snapshot) return items;
        feedCacheRef.current.set(message.channelId, snapshot);
        return snapshot.messages;
      });
      return;
    }
    const snapshot = applyFeedMessage(feedCacheRef.current.get(message.channelId), message);
    if (snapshot) feedCacheRef.current.set(message.channelId, snapshot);
  }, []);

  const applyPendingMessageToFeed = useCallback((message: ChatMessage) => {
    if (activeChannelIdRef.current === message.channelId) {
      setFeedChannelId(message.channelId);
      setHasNewerMessages(false);
      setPendingNewMessageCount(0);
      setMessages((items) => {
        const current = feedCacheRef.current.get(message.channelId) ?? createFeedSnapshot({ messages: items });
        const snapshot = {
          ...current,
          hasNewerMessages: false,
          messages: upsertChannelMessage(items, message),
        };
        feedCacheRef.current.set(message.channelId, snapshot);
        return snapshot.messages;
      });
      return;
    }
    const current = feedCacheRef.current.get(message.channelId) ?? createFeedSnapshot();
    feedCacheRef.current.set(message.channelId, {
      ...current,
      hasNewerMessages: false,
      messages: upsertChannelMessage(current.messages, message),
    });
  }, []);

  const resolvePendingMessageInFeed = useCallback((pendingMessageId: string, message: ChatMessage) => {
    if (activeChannelIdRef.current === message.channelId) {
      setFeedChannelId(message.channelId);
      setMessages((items) => {
        const messagesWithoutPending = removeMessageById(items, pendingMessageId);
        const snapshot = applyFeedMessage(
          {
            ...(feedCacheRef.current.get(message.channelId) ?? createFeedSnapshot({ messages: items })),
            messages: message.rootMessageId ? messagesWithoutPending : replacePendingMessage(items, pendingMessageId, message),
          },
          message,
        );
        if (!snapshot) return items;
        feedCacheRef.current.set(message.channelId, snapshot);
        return snapshot.messages;
      });
      return;
    }
    const snapshot = feedCacheRef.current.get(message.channelId);
    const messagesWithoutPending = removeMessageById(snapshot?.messages ?? [], pendingMessageId);
    const nextSnapshot = applyFeedMessage(
      {
        ...(snapshot ?? createFeedSnapshot()),
        messages: message.rootMessageId ? messagesWithoutPending : replacePendingMessage(snapshot?.messages ?? [], pendingMessageId, message),
      },
      message,
    );
    if (nextSnapshot) feedCacheRef.current.set(message.channelId, nextSnapshot);
  }, []);

  const markPendingMessageSendingInFeed = useCallback((channelId: string, pendingMessageId: string) => {
    if (activeChannelIdRef.current === channelId) {
      setMessages((items) => {
        const snapshot = {
          ...(feedCacheRef.current.get(channelId) ?? createFeedSnapshot({ messages: items })),
          messages: updatePendingMessageDelivery(items, pendingMessageId, markPendingChatMessageSending),
        };
        feedCacheRef.current.set(channelId, snapshot);
        return snapshot.messages;
      });
      return;
    }
    const snapshot = feedCacheRef.current.get(channelId);
    if (snapshot) {
      feedCacheRef.current.set(channelId, {
        ...snapshot,
        messages: updatePendingMessageDelivery(snapshot.messages, pendingMessageId, markPendingChatMessageSending),
      });
    }
  }, []);

  const markPendingMessageFailedInFeed = useCallback((channelId: string, pendingMessageId: string, error: string) => {
    if (activeChannelIdRef.current === channelId) {
      setMessages((items) => {
        const snapshot = {
          ...(feedCacheRef.current.get(channelId) ?? createFeedSnapshot({ messages: items })),
          messages: updatePendingMessageDelivery(items, pendingMessageId, (message) => markPendingChatMessageFailed(message, error)),
        };
        feedCacheRef.current.set(channelId, snapshot);
        return snapshot.messages;
      });
      return;
    }
    const snapshot = feedCacheRef.current.get(channelId);
    if (snapshot) {
      feedCacheRef.current.set(channelId, {
        ...snapshot,
        messages: updatePendingMessageDelivery(snapshot.messages, pendingMessageId, (message) => markPendingChatMessageFailed(message, error)),
      });
    }
  }, []);

  const removePendingMessageFromFeed = useCallback((channelId: string, pendingMessageId: string) => {
    if (activeChannelIdRef.current === channelId) {
      setMessages((items) => {
        const snapshot = {
          ...(feedCacheRef.current.get(channelId) ?? createFeedSnapshot({ messages: items })),
          messages: removeMessageById(items, pendingMessageId),
        };
        feedCacheRef.current.set(channelId, snapshot);
        return snapshot.messages;
      });
      return;
    }
    const snapshot = feedCacheRef.current.get(channelId);
    if (snapshot) {
      feedCacheRef.current.set(channelId, {
        ...snapshot,
        messages: removeMessageById(snapshot.messages, pendingMessageId),
      });
    }
  }, []);

  const applyLatestMessagesToViewport = useCallback((
    channelId: string,
    latestMessages: ChatMessage[],
    behavior: ScrollBehavior,
  ) => {
    if (activeChannelIdRef.current !== channelId) return;
    const viewport = readViewportSnapshot();
    const scrollAnchor = viewport.mode === "browsingHistory"
      ? readChatFeedScrollAnchor(messageScrollRef.current)
      : null;
    const currentSnapshot = feedCacheRef.current.get(channelId);
    const reconciliation = viewport.mode === "followingLatest"
      ? {
          newMessageCount: 0,
          snapshot: replaceFeedMessages(currentSnapshot, latestMessages),
          visibleMessagesChanged: true,
        }
      : reconcileFeedLatestWindow(currentSnapshot, latestMessages);
    feedCacheRef.current.set(channelId, reconciliation.snapshot);
    applySnapshotToActiveFeed(channelId, reconciliation.snapshot);

    if (viewport.mode === "followingLatest") {
      setPendingNewMessageCount(0);
      requestScrollToLatest(behavior);
      return;
    }

    setPendingNewMessageCount((count) => Math.max(count, reconciliation.newMessageCount));
    if (!reconciliation.visibleMessagesChanged || !scrollAnchor) return;
    window.requestAnimationFrame(() => {
      if (activeChannelIdRef.current !== channelId) return;
      const currentViewport = readViewportSnapshot();
      if (currentViewport.mode !== "browsingHistory" || currentViewport.revision !== viewport.revision) return;
      const element = messageScrollRef.current;
      if (!runProgrammaticScroll("layout-correction", () => restoreChatFeedScrollAnchor(element, scrollAnchor), "auto")) return;
      rememberActiveFeedScroll(channelId);
    });
  }, [applySnapshotToActiveFeed, readViewportSnapshot, rememberActiveFeedScroll, requestScrollToLatest, runProgrammaticScroll]);

  const loadLatestMessages = useCallback(async (behavior: ScrollBehavior = "smooth") => {
    const channelId = activeChannelIdRef.current;
    if (!channelId) return;
    setFollowingLatest(true);
    const reconciledSnapshot = promoteReconciledLatestWindow(feedCacheRef.current.get(channelId));
    if (reconciledSnapshot) {
      const previousSnapshot = feedCacheRef.current.get(channelId);
      if (previousSnapshot?.latestWindowMessages.length) {
        feedCacheRef.current.set(channelId, reconciledSnapshot);
        if (applySnapshotToActiveFeed(channelId, reconciledSnapshot)) {
          setPendingNewMessageCount(0);
          setFollowingLatest(true);
          requestScrollToLatest(behavior);
        }
        return;
      }
    }
    setMessagesLoading(!feedCacheRef.current.has(channelId));
    try {
      const response = await getChatMessages({ channelId, limit: chatMessagePageSize });
      applyLatestMessagesToViewport(channelId, response.messages, behavior);
    } catch (error) {
      if (activeChannelIdRef.current === channelId) {
        notify(error instanceof Error ? error.message : "加载最新消息失败");
      }
    } finally {
      if (activeChannelIdRef.current === channelId) setMessagesLoading(false);
    }
  }, [applyLatestMessagesToViewport, applySnapshotToActiveFeed, notify, requestScrollToLatest, setFollowingLatest]);

  const reconcileLatestMessagesPreservingPosition = useCallback(async () => {
    const channelId = activeChannelIdRef.current;
    if (!channelId) return;
    const response = await getChatMessages({ channelId, limit: chatMessagePageSize });
    applyLatestMessagesToViewport(channelId, response.messages, "auto");
  }, [applyLatestMessagesToViewport]);

  const prefetchChannelMessages = useCallback((channelId: string) => {
    if (feedCacheRef.current.has(channelId)) return Promise.resolve(true);
    const existingRequest = prefetchRequestsRef.current.get(channelId);
    if (existingRequest) return existingRequest;

    const request = getChatMessages({ channelId, limit: chatMessagePageSize })
      .then((response) => {
        const snapshot = replaceFeedMessages(feedCacheRef.current.get(channelId), response.messages);
        feedCacheRef.current.set(channelId, snapshot);
        applySnapshotToActiveFeed(channelId, snapshot);
        return true;
      })
      .catch(() => false)
      .finally(() => {
        prefetchRequestsRef.current.delete(channelId);
      });

    prefetchRequestsRef.current.set(channelId, request);
    return request;
  }, [applySnapshotToActiveFeed]);

  const cancelPendingReadReceipt = useCallback(() => {
    const pending = pendingReadReceiptRef.current;
    if (pending) window.clearTimeout(pending.timer);
    pendingReadReceiptRef.current = null;
  }, []);

  const markReadThroughMessage = useCallback(async (channelId: string, messageId: string) => {
    const requestKey = `${channelId}:${messageId}`;
    if (readMarkInFlightRef.current === requestKey) return;
    readMarkInFlightRef.current = requestKey;
    try {
      const response = await markChatChannelReadRequest(channelId, { messageId });
      void onUnreadSummaryRefresh().catch(() => undefined);
      if (activeChannelIdRef.current !== channelId) return;
      onChannelUpdate(response.channel);
      setUnreadAnchor(buildUnreadAnchor(response.channel, currentUserIdRef.current));
      manualUnreadAutoReadSuppressedRef.current = false;
    } catch {
      // Automatic read receipts are opportunistic; manual "mark read" remains available on failure.
    } finally {
      if (readMarkInFlightRef.current === requestKey) readMarkInFlightRef.current = null;
    }
  }, [onChannelUpdate, onUnreadSummaryRefresh]);

  const scheduleVisibleReadReceipt = useCallback(() => {
    const channelId = activeChannelIdRef.current;
    const anchor = unreadAnchorRef.current;
    if (
      !channelId ||
      !anchor ||
      !hasMainFeedUnread(anchor) ||
      messagesLoadingRef.current ||
      !appAttentionStateRef.current.activelyViewed ||
      (anchor.manuallyUnread && manualUnreadAutoReadSuppressedRef.current) ||
      pendingUnreadScrollRef.current?.channelId === channelId ||
      pendingReadingPositionScrollRef.current?.channelId === channelId
    ) {
      cancelPendingReadReceipt();
      return;
    }

    const candidate = selectChatReadThroughCandidate({
      container: messageScrollRef.current,
      currentUserId: currentUserIdRef.current,
      messages: messagesRef.current,
      unreadAnchor: anchor,
    });
    if (!candidate) {
      cancelPendingReadReceipt();
      return;
    }

    const requestKey = `${channelId}:${candidate.id}`;
    if (readMarkInFlightRef.current === requestKey) {
      cancelPendingReadReceipt();
      return;
    }
    const pending = pendingReadReceiptRef.current;
    if (pending?.channelId === channelId && pending.messageId === candidate.id) return;

    cancelPendingReadReceipt();
    const timer = window.setTimeout(() => {
      const latestCandidate = selectChatReadThroughCandidate({
        container: messageScrollRef.current,
        currentUserId: currentUserIdRef.current,
        messages: messagesRef.current,
        unreadAnchor: unreadAnchorRef.current,
      });
      pendingReadReceiptRef.current = null;
      if (
        activeChannelIdRef.current !== channelId ||
        messagesLoadingRef.current ||
        !appAttentionStateRef.current.activelyViewed ||
        latestCandidate?.id !== candidate.id
      ) {
        window.requestAnimationFrame(scheduleVisibleReadReceipt);
        return;
      }
      void markReadThroughMessage(channelId, candidate.id);
    }, chatReadReceiptStableMs);

    pendingReadReceiptRef.current = { channelId, messageId: candidate.id, timer };
  }, [cancelPendingReadReceipt, markReadThroughMessage]);

  // Rebuild the feed only when the channel identity changes; channel read updates are reconciled through the read observer.
  useEffect(() => {
    if (!activeChannel) return undefined;
    let cancelled = false;
    const channelId = activeChannel.id;
    const anchor = buildUnreadAnchor(activeChannel, currentUserId);
    const cachedFeed = feedCacheRef.current.get(channelId);
    const readingPosition = requestedMessageId ? null : readRestorableFeedPosition(channelId);
    const openIntent = resolveChatFeedOpenIntent({
      readingPosition,
      requestedMessageId,
      unreadAnchor: anchor,
    });
    const cachedHasRequestedMessage = Boolean(
      requestedMessageId &&
      cachedFeed?.messages.some((message) => message.id === requestedMessageId || message.rootMessageId === requestedMessageId),
    );
    const cachedHasReadingPositionMessage = Boolean(
      openIntent.kind === "restore" &&
      cachedFeed?.messages.some((message) => message.id === openIntent.position.messageId),
    );
    const shouldPreserveCachedWindow = openIntent.kind === "latest" && shouldPreserveFeedWindow(cachedFeed);
    manualUnreadAutoReadSuppressedRef.current = false;
    cancelPendingReadReceipt();
    pendingReadingPositionScrollRef.current = null;
    pendingUnreadScrollRef.current = openIntent.kind === "unread" ? { channelId, source: "channel-open" } : null;
    setFollowingLatest(openIntent.kind === "latest" && !shouldPreserveCachedWindow);
    setUnreadAnchor(anchor);
    setPendingNewMessageCount(0);
    olderLoadInFlightRef.current = false;
    rememberChatLastChannel({
      channelId,
      userId: currentUserId,
    });
    setFeedChannelId(channelId);
    setMessages(cachedFeed?.messages ?? []);
    setHasNewerMessages(cachedFeed?.hasNewerMessages ?? false);
    setHasOlderMessages(cachedFeed?.hasOlderMessages ?? false);
    setMessagesLoading(
      openIntent.kind === "unread" ||
      Boolean(openIntent.kind === "restore" && !cachedHasReadingPositionMessage) ||
      Boolean(openIntent.kind === "latest" && !cachedFeed) ||
      Boolean(openIntent.kind === "message" && !cachedHasRequestedMessage),
    );
    const isCancelled = () => cancelled;
    const loadLatestFallback = async () => {
      try {
        await loadLatestWindowForOpen(channelId, isCancelled);
      } catch (latestError) {
        if (!cancelled) notify(latestError instanceof Error ? latestError.message : "加载消息失败");
      }
    };
    const loadReadingPositionFallback = async (position: ChatFeedReadingPosition) => {
      try {
        await loadReadingPositionWindow(channelId, position, isCancelled);
      } catch {
        clearChatFeedReadingPosition(currentUserId, channelId);
        await loadLatestFallback();
      }
    };
    if (openIntent.kind === "unread") {
      void getChatUnreadTarget({
        anchor: openIntent.anchor,
        channelId,
        limit: chatMessagePageSize,
        surface: "main",
      })
        .then((response) => {
          if (cancelled) return;
          if (response.target.kind === "threadMention") {
            pendingUnreadScrollRef.current = null;
            onThreadTarget({
              focusMessageId: response.target.targetMessageId,
              rootMessageId: response.target.rootMessageId,
            });
            return;
          }
          applyContextWindowToFeed(channelId, response.target.context, "unread");
          pendingUnreadScrollRef.current = {
            channelId,
            messageId: response.target.context.targetMessageId,
            source: "channel-open",
          };
        })
        .catch(async (error) => {
          if (cancelled) return;
          pendingUnreadScrollRef.current = null;
          if (!(error instanceof ApiError && [404, 410].includes(error.status))) {
            notify(error instanceof Error ? error.message : "加载未读消息失败");
          }
          const fallbackPosition = readRestorableFeedPosition(channelId);
          if (fallbackPosition) {
            await loadReadingPositionFallback(fallbackPosition);
            return;
          }
          await loadLatestFallback();
        })
        .finally(() => {
          if (!cancelled) setMessagesLoading(false);
        });
    } else if (openIntent.kind === "restore" && cachedHasReadingPositionMessage) {
      pendingReadingPositionScrollRef.current = openIntent.position;
      setMessagesLoading(false);
    } else if (openIntent.kind === "restore") {
      void loadReadingPositionWindow(channelId, openIntent.position, isCancelled)
        .catch((error) => {
          if (cancelled) return;
          if (error instanceof ApiError && [403, 404, 410].includes(error.status)) {
            clearChatFeedReadingPosition(currentUserId, channelId);
          } else {
            notify(error instanceof Error ? error.message : "恢复阅读位置失败");
          }
          return loadLatestFallback();
        })
        .finally(() => {
          if (!cancelled) setMessagesLoading(false);
        });
    } else if (openIntent.kind === "latest" && isFreshFeedSnapshot(cachedFeed)) {
      setMessagesLoading(false);
      if (shouldPreserveCachedWindow) {
        setFollowingLatest(false);
      } else if (cachedFeed?.hasNewerMessages) {
        void loadLatestMessages("auto");
      } else {
        requestScrollToLatest("auto");
        void loadLatestMessages("auto");
      }
    } else if (openIntent.kind === "latest") {
      void loadLatestWindowForOpen(channelId, isCancelled)
        .catch((error) => {
          if (!cancelled) notify(error instanceof Error ? error.message : "加载消息失败");
        })
        .finally(() => {
          if (!cancelled) setMessagesLoading(false);
        });
    } else if (openIntent.kind === "message" && cachedHasRequestedMessage) {
      setMessagesLoading(false);
    }
    return () => {
      cancelled = true;
      cancelPendingReadReceipt();
      rememberActiveFeedScroll(channelId, { persistReadingPosition: true });
    };
  }, [
    activeChannelId,
    applyContextWindowToFeed,
    cancelPendingReadReceipt,
    currentUserId,
    loadLatestMessages,
    loadLatestWindowForOpen,
    loadReadingPositionWindow,
    notify,
    onThreadTarget,
    rememberActiveFeedScroll,
    readRestorableFeedPosition,
    requestScrollToLatest,
    requestedMessageId,
    setFollowingLatest,
  ]);

  useEffect(() => {
    const wasActivelyViewed = lastAttentionActivelyViewedRef.current;
    lastAttentionActivelyViewedRef.current = appAttentionState.activelyViewed;
    if (!activeChannelId) {
      inactiveViewportModeRef.current = null;
      return;
    }
    if (wasActivelyViewed === appAttentionState.activelyViewed) return;

    if (!appAttentionState.activelyViewed) {
      inactiveViewportModeRef.current = readViewportSnapshot().mode;
      rememberActiveFeedScroll(activeChannelId, { persistReadingPosition: true });
      return;
    }

    const inactiveViewportMode = inactiveViewportModeRef.current;
    inactiveViewportModeRef.current = null;
    if (requestedMessageId) return;
    if (inactiveViewportMode === "followingLatest") {
      requestScrollToLatest("auto");
      return;
    }
    const readingPosition = readRestorableFeedPosition(activeChannelId);
    if (!readingPosition) return;
    pendingReadingPositionScrollRef.current = readingPosition;
    setFollowingLatest(false);
    setAttentionRestoreRevision((revision) => revision + 1);
  }, [
    activeChannelId,
    appAttentionState.activelyViewed,
    readRestorableFeedPosition,
    readViewportSnapshot,
    rememberActiveFeedScroll,
    requestScrollToLatest,
    requestedMessageId,
    setFollowingLatest,
  ]);

  useEffect(() => {
    if (!activeChannel) return;
    const nextAnchor = buildUnreadAnchor(activeChannel, currentUserId);
    setUnreadAnchor(nextAnchor);
  }, [activeChannel, currentUserId]);

  useEffect(() => {
    if (appAttentionState.activelyViewed) {
      scheduleVisibleReadReceipt();
    } else {
      cancelPendingReadReceipt();
    }
    return cancelPendingReadReceipt;
  }, [appAttentionState.activelyViewed, cancelPendingReadReceipt, scheduleVisibleReadReceipt]);

  useEffect(() => {
    if (!activeChannelId || !requestedMessageId) return undefined;
    const targetInCurrentFeed = messages.some((message) => message.id === requestedMessageId || message.rootMessageId === requestedMessageId);
    if (targetInCurrentFeed) {
      contextRequestKeyRef.current = null;
      return undefined;
    }

    let cancelled = false;
    const requestKey = `${activeChannelId}:${requestedMessageId}`;
    if (contextRequestKeyRef.current === requestKey) return undefined;
    contextRequestKeyRef.current = requestKey;
    setMessagesLoading(true);
    void getChatMessageContext({ channelId: activeChannelId, messageId: requestedMessageId, limit: chatMessagePageSize })
      .then((response) => {
        if (cancelled) return;
        const snapshot = replaceFeedMessages(
          feedCacheRef.current.get(activeChannelId),
          response.messages,
          chatMessagePageSize,
          {
            hasNewerMessages: response.hasNewerMessages,
            hasOlderMessages: response.hasOlderMessages,
            windowKind: "context",
          },
        );
        feedCacheRef.current.set(activeChannelId, snapshot);
        setFeedChannelId(activeChannelId);
        setMessages(snapshot.messages);
        setHasNewerMessages(snapshot.hasNewerMessages);
        setHasOlderMessages(snapshot.hasOlderMessages);
        if (response.targetMessageId !== requestedMessageId) {
          onThreadTarget({ focusMessageId: requestedMessageId, rootMessageId: response.targetMessageId });
          onRequestedMessageRedirect(response.targetMessageId);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          onRequestedMessageConsumed();
          if (error instanceof ApiError && [403, 404, 410].includes(error.status)) {
            onRequestedMessageUnavailable();
          } else {
            notify(error instanceof Error ? error.message : "加载目标消息失败");
          }
        }
      })
      .finally(() => {
        if (!cancelled && contextRequestKeyRef.current === requestKey) {
          contextRequestKeyRef.current = null;
          setMessagesLoading(false);
        }
      });
    return () => {
      cancelled = true;
      if (contextRequestKeyRef.current === requestKey) contextRequestKeyRef.current = null;
    };
  }, [
    activeChannelId,
    messages,
    notify,
    onRequestedMessageConsumed,
    onRequestedMessageRedirect,
    onRequestedMessageUnavailable,
    onThreadTarget,
    requestedMessageId,
  ]);

  useLayoutEffect(() => {
    if (!requestedMessageId || !messages.some((message) => message.id === requestedMessageId || message.rootMessageId === requestedMessageId)) return undefined;
    pendingReadingPositionScrollRef.current = null;
    setFollowingLatest(false);
    const viewport = readViewportSnapshot();
    return runChatViewportLayoutIntent({
      element: messageScrollRef.current,
      restore: () => runProgrammaticScroll(
        "message",
        () => scrollChatFeedToMessage(messageScrollRef.current, requestedMessageId, { behavior: "auto", block: "center" }),
        "auto",
      ),
      settled: () => isChatFeedMessagePositioned(
        messageScrollRef.current,
        requestedMessageId,
        { block: "center" },
      ),
      subscribeLayoutChanges,
      valid: () => {
        const current = readViewportSnapshot();
        return current.mode === "browsingHistory" && current.revision === viewport.revision;
      },
      onDone: () => {
        rememberActiveFeedScroll(activeChannelId, { persistReadingPosition: true });
        onRequestedMessageLocated(requestedMessageId);
        onRequestedMessageConsumed();
      },
      onInvalidated: onRequestedMessageConsumed,
    });
  }, [activeChannelId, messages, onRequestedMessageConsumed, onRequestedMessageLocated, readViewportSnapshot, rememberActiveFeedScroll, requestedMessageId, runProgrammaticScroll, setFollowingLatest, subscribeLayoutChanges]);

  useLayoutEffect(() => {
    const position = pendingReadingPositionScrollRef.current;
    if (!position || messagesLoading) return undefined;
    setFollowingLatest(false);
    const viewport = readViewportSnapshot();
    return runChatViewportLayoutIntent({
      element: messageScrollRef.current,
      restore: () => {
        const element = messageScrollRef.current;
        if (!element) return false;
        return runProgrammaticScroll("reading-position", () => {
          if (restoreChatFeedScrollAnchor(element, position)) return true;
          const anchorStillInFeed = messagesRef.current.some((message) => message.id === position.messageId);
          if (anchorStillInFeed) return false;
          setChatFeedScrollTopInstant(element, position.scrollTop);
          return true;
        }, "auto");
      },
      subscribeLayoutChanges,
      valid: () => {
        const current = readViewportSnapshot();
        return current.mode === "browsingHistory" && current.revision === viewport.revision;
      },
      onDone: () => {
        pendingReadingPositionScrollRef.current = null;
        rememberActiveFeedScroll(position.channelId, { persistReadingPosition: true });
        window.requestAnimationFrame(scheduleVisibleReadReceipt);
      },
      onInvalidated: () => {
        pendingReadingPositionScrollRef.current = null;
        window.requestAnimationFrame(scheduleVisibleReadReceipt);
      },
    });
  }, [attentionRestoreRevision, messages, messagesLoading, readViewportSnapshot, rememberActiveFeedScroll, runProgrammaticScroll, scheduleVisibleReadReceipt, setFollowingLatest, subscribeLayoutChanges]);

  useLayoutEffect(() => {
    const pendingUnreadScroll = pendingUnreadScrollRef.current;
    if (!pendingUnreadScroll || messagesLoading) return undefined;
    pendingReadingPositionScrollRef.current = null;
    setFollowingLatest(false);
    const viewport = readViewportSnapshot();
    return runChatViewportLayoutIntent({
      element: messageScrollRef.current,
      restore: () => runProgrammaticScroll(
        "unread",
        () => (
          scrollChatFeedToUnread(messageScrollRef.current, { behavior: "auto" }) ||
          Boolean(
            pendingUnreadScroll.messageId &&
            scrollChatFeedToMessage(messageScrollRef.current, pendingUnreadScroll.messageId, {
              behavior: "auto",
              block: "start",
              offset: 48,
            })
          )
        ),
        "auto",
      ),
      settled: () => isChatFeedUnreadPositioned(messageScrollRef.current),
      subscribeLayoutChanges,
      valid: () => {
        const current = readViewportSnapshot();
        return current.mode === "browsingHistory" && current.revision === viewport.revision;
      },
      onDone: () => {
        if (pendingUnreadScrollRef.current === pendingUnreadScroll) {
          pendingUnreadScrollRef.current = null;
        }
        rememberActiveFeedScroll(activeChannelId, { persistReadingPosition: true });
        window.requestAnimationFrame(scheduleVisibleReadReceipt);
      },
      onInvalidated: () => {
        if (pendingUnreadScrollRef.current === pendingUnreadScroll) {
          pendingUnreadScrollRef.current = null;
        }
        window.requestAnimationFrame(scheduleVisibleReadReceipt);
      },
    });
  }, [activeChannelId, messages, messagesLoading, readViewportSnapshot, rememberActiveFeedScroll, runProgrammaticScroll, scheduleVisibleReadReceipt, setFollowingLatest, subscribeLayoutChanges, viewportLayoutIntentRevision]);

  useLayoutEffect(() => {
    scheduleVisibleReadReceipt();
  }, [messages, messagesLoading, scheduleVisibleReadReceipt, unreadAnchor]);

  useEffect(() => {
    if (!hasMainFeedUnread(unreadAnchor)) return undefined;
    const element = messageScrollRef.current;
    if (!element) return undefined;

    let frame: number | null = null;
    const scheduleAfterLayout = () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        frame = null;
        scheduleVisibleReadReceipt();
      });
    };

    const unsubscribeLayoutChanges = subscribeLayoutChanges(scheduleAfterLayout);
    scheduleAfterLayout();
    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      unsubscribeLayoutChanges();
    };
  }, [scheduleVisibleReadReceipt, subscribeLayoutChanges, unreadAnchor]);

  const loadOlderMessages = useCallback(async () => {
    if (!activeChannelId || messages.length === 0 || olderLoadInFlightRef.current || isLatestScrollPending() || !hasOlderMessages) return;
    setFollowingLatest(false);
    const scrollElement = messageScrollRef.current;
    const previousScrollHeight = scrollElement?.scrollHeight ?? 0;
    const previousScrollTop = scrollElement?.scrollTop ?? 0;
    const scrollAnchor = readChatFeedScrollAnchor(scrollElement);
    olderLoadInFlightRef.current = true;
    setOlderMessagesLoading(true);
    try {
      const response = await getChatMessages({ channelId: activeChannelId, before: messages[0].createdAt, limit: chatMessagePageSize });
      if (activeChannelIdRef.current !== activeChannelId) return;
      setMessages((items) => {
        const snapshot = prependOlderFeedMessages(
          feedCacheRef.current.get(activeChannelId) ?? createFeedSnapshot({ messages: items, scrollTop: previousScrollTop }),
          response.messages,
        );
        feedCacheRef.current.set(activeChannelId, snapshot);
        setFeedChannelId(activeChannelId);
        setHasNewerMessages(snapshot.hasNewerMessages);
        setHasOlderMessages(snapshot.hasOlderMessages);
        return snapshot.messages;
      });
      window.requestAnimationFrame(() => {
        const element = messageScrollRef.current;
        if (!element) return;
        runProgrammaticScroll("layout-correction", () => {
          if (restoreChatFeedScrollAnchor(element, scrollAnchor)) return true;
          const nextTop = element.scrollHeight - previousScrollHeight + previousScrollTop;
          setChatFeedScrollTopInstant(element, Math.max(0, nextTop));
          return true;
        }, "auto");
        rememberActiveFeedScroll(activeChannelId);
      });
    } catch (error) {
      notify(error instanceof Error ? error.message : "加载更早消息失败");
    } finally {
      olderLoadInFlightRef.current = false;
      setOlderMessagesLoading(false);
    }
  }, [activeChannelId, hasOlderMessages, isLatestScrollPending, messages, notify, rememberActiveFeedScroll, runProgrammaticScroll, setFollowingLatest]);

  const handleMessageScroll = useCallback(() => {
    const result = handleLatestStickinessScroll();
    if (shouldRecordChatFeedReadingPosition(result.source)) {
      rememberActiveFeedScroll(activeChannelIdRef.current, { persistReadingPosition: true });
    }
    if (result.source === "ambient") return;
    if (result.nearLatest) setPendingNewMessageCount(0);
    if (!isLatestScrollPending()) scheduleVisibleReadReceipt();
    if (
      result.source === "user" &&
      !isLatestScrollPending() &&
      isChatFeedNearOldest(messageScrollRef.current)
    ) {
      void loadOlderMessages();
    }
  }, [
    handleLatestStickinessScroll,
    isLatestScrollPending,
    loadOlderMessages,
    rememberActiveFeedScroll,
    scheduleVisibleReadReceipt,
  ]);

  const markActiveChannelUnread = useCallback(async () => {
    if (!activeChannelId) return;
    cancelPendingReadReceipt();
    manualUnreadAutoReadSuppressedRef.current = true;
    const response = await setChatChannelUnreadRequest({ channelId: activeChannelId });
    void onUnreadSummaryRefresh().catch(() => undefined);
    onChannelUpdate(response.channel);
    const member = currentMembership(response.channel, currentUserIdRef.current);
    setUnreadAnchor({
      channelId: response.channel.id,
      lastReadAt: member?.lastReadAt ?? null,
      lastReadMessageId: member?.lastReadMessageId ?? null,
      manuallyUnread: true,
      mainMentionCount: response.channel.mainMentionCount,
      mentionCount: response.channel.mentionCount,
      threadMentionCount: response.channel.threadMentionCount,
      threadUnreadCount: response.channel.threadUnreadCount,
      unreadCount: response.channel.unreadCount,
    });
  }, [activeChannelId, cancelPendingReadReceipt, onChannelUpdate, onUnreadSummaryRefresh]);

  const clearActiveChannelUnread = useCallback(async () => {
    const channelId = activeChannelIdRef.current;
    if (!channelId) return;
    try {
      cancelPendingReadReceipt();
      const response = await markChatChannelReadRequest(channelId, { includeThreads: true });
      void onUnreadSummaryRefresh().catch(() => undefined);
      if (activeChannelIdRef.current !== channelId) return;
      onChannelUpdate(response.channel);
      setUnreadAnchor(null);
      manualUnreadAutoReadSuppressedRef.current = false;
    } catch (error) {
      if (activeChannelIdRef.current === channelId) {
        notify(error instanceof Error ? error.message : "标记已读失败");
      }
    }
  }, [cancelPendingReadReceipt, notify, onChannelUpdate, onUnreadSummaryRefresh]);

  const markMessageUnread = useCallback(async (message: ChatMessage) => {
    cancelPendingReadReceipt();
    manualUnreadAutoReadSuppressedRef.current = true;
    const response = await setChatChannelUnreadRequest({ channelId: message.channelId, messageId: message.id });
    void onUnreadSummaryRefresh().catch(() => undefined);
    onChannelUpdate(response.channel);
    if (message.channelId !== activeChannelIdRef.current) return;
    const member = currentMembership(response.channel, currentUserIdRef.current);
    setUnreadAnchor({
      channelId: response.channel.id,
      lastReadAt: member?.lastReadAt ?? null,
      lastReadMessageId: member?.lastReadMessageId ?? null,
      manuallyUnread: true,
      mainMentionCount: response.channel.mainMentionCount,
      mentionCount: response.channel.mentionCount,
      threadMentionCount: response.channel.threadMentionCount,
      threadUnreadCount: response.channel.threadUnreadCount,
      unreadCount: response.channel.unreadCount,
    });
  }, [cancelPendingReadReceipt, onChannelUpdate, onUnreadSummaryRefresh]);

  const jumpToUnread = useCallback(async (target: ChatUnreadJumpTarget) => {
    const channelId = activeChannelIdRef.current;
    if (!channelId) return;
    setFollowingLatest(false);
    if (target.surface === "main" && !target.contextRequired) {
      if (
        runProgrammaticScroll(
          "unread",
          () => scrollChatFeedToUnread(messageScrollRef.current, { behavior: "auto" }),
          "auto",
        )
      ) {
        pendingUnreadScrollRef.current = { channelId, messageId: target.messageId, source: "jump" };
        setViewportLayoutIntentRevision((value) => value + 1);
        rememberActiveFeedScroll(channelId, { persistReadingPosition: true });
        return;
      }
      const targetMessageId = target.messageId;
      if (
        targetMessageId &&
        runProgrammaticScroll(
          "unread",
          () => scrollChatFeedToMessage(messageScrollRef.current, targetMessageId, { behavior: "auto", block: "start", offset: 48 }),
          "auto",
        )
      ) {
        pendingUnreadScrollRef.current = { channelId, messageId: targetMessageId, source: "jump" };
        setViewportLayoutIntentRevision((value) => value + 1);
        rememberActiveFeedScroll(channelId, { persistReadingPosition: true });
        return;
      }
    }

    if (target.surface === "main") setMessagesLoading(true);
    try {
      const response = await getChatUnreadTarget({
        anchor: unreadAnchor,
        channelId,
        limit: chatMessagePageSize,
        surface: target.surface,
      });
      if (activeChannelIdRef.current !== channelId) return;
      if (response.target.kind === "threadMention") {
        onThreadTarget({
          focusMessageId: response.target.targetMessageId,
          rootMessageId: response.target.rootMessageId,
        });
        return;
      }
      const context = response.target.context;
      const snapshot = replaceFeedMessages(
        feedCacheRef.current.get(channelId),
        context.messages,
        chatMessagePageSize,
        {
          hasNewerMessages: context.hasNewerMessages,
          hasOlderMessages: context.hasOlderMessages,
          windowKind: "unread",
        },
      );
      feedCacheRef.current.set(channelId, snapshot);
      if (applySnapshotToActiveFeed(channelId, snapshot)) {
        pendingUnreadScrollRef.current = {
          channelId,
          messageId: context.targetMessageId,
          source: "jump",
        };
      }
    } catch (error) {
      if (activeChannelIdRef.current === channelId) {
        notify(error instanceof Error ? error.message : "加载未读消息失败");
      }
    } finally {
      if (target.surface === "main" && activeChannelIdRef.current === channelId) setMessagesLoading(false);
    }
  }, [applySnapshotToActiveFeed, notify, onThreadTarget, rememberActiveFeedScroll, runProgrammaticScroll, setFollowingLatest, unreadAnchor]);

  const loadLatestOrScroll = useCallback(() => {
    if (hasNewerMessages) {
      void loadLatestMessages("smooth");
    } else {
      requestScrollToLatest("smooth");
    }
  }, [hasNewerMessages, loadLatestMessages, requestScrollToLatest]);

  const activeFeedSnapshot = activeChannelId ? feedCacheRef.current.get(activeChannelId) : undefined;
  const activeFeedIsState = Boolean(activeChannelId) && feedChannelId === activeChannelId;
  const displayedMessages = !activeChannelId
    ? []
    : activeFeedIsState
      ? messages
      : activeFeedSnapshot?.messages ?? [];
  const displayedHasNewerMessages = !activeChannelId
    ? false
    : activeFeedIsState
      ? hasNewerMessages
      : activeFeedSnapshot?.hasNewerMessages ?? false;
  const displayedHasOlderMessages = !activeChannelId
    ? false
    : activeFeedIsState
      ? hasOlderMessages
      : activeFeedSnapshot?.hasOlderMessages ?? false;
  const displayedMessagesLoading = !activeChannelId
    ? false
    : activeFeedIsState
      ? messagesLoading
      : !activeFeedSnapshot;
  messagesLoadingRef.current = displayedMessagesLoading;
  messagesRef.current = displayedMessages;

  return {
    applyMessageToFeed,
    applyPendingMessageToFeed,
    clearActiveChannelUnread,
    handleMessageScroll,
    hasNewerMessages: displayedHasNewerMessages,
    hasOlderMessages: displayedHasOlderMessages,
    jumpToUnread,
    loadLatestMessages,
    loadLatestOrScroll,
    loadOlderMessages,
    markActiveChannelUnread,
    markMessageUnread,
    messageScrollRef,
    messages: displayedMessages,
    messagesLoading: displayedMessagesLoading,
    markPendingMessageFailedInFeed,
    markPendingMessageSendingInFeed,
    olderMessagesLoading,
    pendingNewMessageCount,
    prefetchChannelMessages,
    reconcileLatestMessagesPreservingPosition,
    removePendingMessageFromFeed,
    requestScrollToLatest,
    resolvePendingMessageInFeed,
    unreadAnchor,
  };
}
