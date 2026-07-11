import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  getChatMessageContext,
  getChatMessages,
  getChatUnreadContext,
  getChatUnreadTarget,
  markChatChannelReadRequest,
  setChatChannelUnreadRequest,
} from "../../state/apiClient";
import type { ChatChannel, ChatMessage } from "../../types/orf";
import {
  isChatFeedNearLatest,
  isChatFeedNearOldest,
  isChatFeedMessageVisible,
  readChatFeedScrollAnchor,
  restoreChatFeedScrollAnchor,
  scrollChatFeedToMessage,
  scrollChatFeedToUnread,
} from "./chatFeedScroll";
import {
  type UnreadAnchor,
  applyFeedMessage,
  buildUnreadAnchor,
  type ChatUnreadJumpTarget,
  chatMessagePageSize,
  createFeedSnapshot,
  currentMembership,
  markPendingChatMessageFailed,
  markPendingChatMessageSending,
  hasMainFeedUnread,
  isFreshFeedSnapshot,
  prependOlderFeedMessages,
  promoteReconciledLatestWindow,
  reconcileFeedLatestWindow,
  rememberFeedScroll,
  removeMessageById,
  replaceFeedMessages,
  replacePendingMessage,
  shouldFollowIncomingMessage,
  shouldPreserveFeedWindow,
  updatePendingMessageDelivery,
  upsertChannelMessage,
} from "./chatModels";
import { chatReadReceiptStableMs, selectChatReadThroughCandidate } from "./chatReadObserver";
import { useChatLatestScrollStickiness } from "./useChatLatestScrollStickiness";
import type { AppAttentionState } from "../interaction/appAttentionState";
import { chatFeedSessionPrefetchRequests, chatFeedSessionSnapshots } from "./chatFeedSessionCache";

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
  onRequestedMessageRedirect: (messageId: string) => void;
  onThreadTarget: (target: ChatFeedThreadTarget) => void;
  onUnreadSummaryRefresh: () => Promise<void>;
  requestedMessageId: string | null;
};

function runChatFeedScrollIntent(
  tryScroll: () => boolean,
  onDone: () => void,
  attempts = 4,
  isSettled?: () => boolean,
) {
  let cancelled = false;
  let frame: number | null = null;
  let remainingAttempts = Math.max(1, attempts);

  const run = () => {
    if (cancelled) return;
    const scrolled = tryScroll();
    remainingAttempts -= 1;
    if ((scrolled && (!isSettled || isSettled())) || remainingAttempts <= 0) {
      onDone();
      return;
    }
    frame = window.requestAnimationFrame(run);
  };

  run();

  return () => {
    cancelled = true;
    if (frame !== null) window.cancelAnimationFrame(frame);
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
  const [unreadAnchor, setUnreadAnchor] = useState<UnreadAnchor | null>(null);
  const [feedChannelId, setFeedChannelId] = useState<string | null>(null);
  const activeChannelIdRef = useRef<string | null>(null);
  const appAttentionStateRef = useRef(appAttentionState);
  const currentUserIdRef = useRef<string | undefined>(undefined);
  const contextRequestKeyRef = useRef<string | null>(null);
  const feedCacheRef = useRef(chatFeedSessionSnapshots());
  const manualUnreadAutoReadSuppressedRef = useRef(false);
  const messageScrollRef = useRef<HTMLDivElement | null>(null);
  const messagesLoadingRef = useRef(false);
  const messagesRef = useRef<ChatMessage[]>([]);
  const olderLoadInFlightRef = useRef(false);
  const pendingReadReceiptRef = useRef<{ channelId: string; messageId: string; timer: number } | null>(null);
  const pendingUnreadScrollRef = useRef(false);
  const prefetchRequestsRef = useRef(chatFeedSessionPrefetchRequests());
  const readMarkInFlightRef = useRef<string | null>(null);
  const unreadAnchorRef = useRef<UnreadAnchor | null>(null);
  const activeChannelId = activeChannel?.id ?? null;
  activeChannelIdRef.current = activeChannelId;
  appAttentionStateRef.current = appAttentionState;
  currentUserIdRef.current = currentUserId;
  unreadAnchorRef.current = unreadAnchor;

  const rememberActiveFeedScroll = useCallback((channelId = activeChannelIdRef.current) => {
    const element = messageScrollRef.current;
    if (!channelId || !element) return;
    feedCacheRef.current.set(channelId, rememberFeedScroll(feedCacheRef.current.get(channelId), element.scrollTop));
  }, []);

  const rememberLatestFeedScroll = useCallback(() => {
    rememberActiveFeedScroll(activeChannelIdRef.current);
  }, [rememberActiveFeedScroll]);

  const {
    handleScroll: handleLatestStickinessScroll,
    isFollowingLatest,
    isLatestScrollPending,
    requestScrollToLatest: requestLatestStickinessScroll,
    setFollowingLatest,
  } = useChatLatestScrollStickiness({
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

  const isMessageScrollNearLatest = useCallback(() => {
    return isChatFeedNearLatest(messageScrollRef.current);
  }, []);

  const applySnapshotToActiveFeed = useCallback((channelId: string, snapshot: ReturnType<typeof createFeedSnapshot>) => {
    if (activeChannelIdRef.current !== channelId) return false;
    setFeedChannelId(channelId);
    setMessages(snapshot.messages);
    setHasNewerMessages(snapshot.hasNewerMessages);
    setHasOlderMessages(snapshot.hasOlderMessages);
    return true;
  }, []);

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

  const loadLatestMessages = useCallback(async (behavior: ScrollBehavior = "smooth") => {
    const channelId = activeChannelIdRef.current;
    if (!channelId) return;
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
      const snapshot = replaceFeedMessages(feedCacheRef.current.get(channelId), response.messages);
      feedCacheRef.current.set(channelId, snapshot);
      if (applySnapshotToActiveFeed(channelId, snapshot)) {
        requestScrollToLatest(behavior);
      }
    } catch (error) {
      if (activeChannelIdRef.current === channelId) {
        notify(error instanceof Error ? error.message : "加载最新消息失败");
      }
    } finally {
      if (activeChannelIdRef.current === channelId) setMessagesLoading(false);
    }
  }, [applySnapshotToActiveFeed, notify, requestScrollToLatest, setFollowingLatest]);

  const reconcileLatestMessagesPreservingPosition = useCallback(async () => {
    const channelId = activeChannelIdRef.current;
    if (!channelId) return;
    const previousSnapshot = feedCacheRef.current.get(channelId);
    const shouldFollowLatest = !previousSnapshot?.hasNewerMessages && (isFollowingLatest() || isMessageScrollNearLatest());
    const scrollAnchor = shouldFollowLatest ? null : readChatFeedScrollAnchor(messageScrollRef.current);
    const response = await getChatMessages({ channelId, limit: chatMessagePageSize });
    if (activeChannelIdRef.current !== channelId) return;
    const reconciliation = reconcileFeedLatestWindow(feedCacheRef.current.get(channelId), response.messages);
    feedCacheRef.current.set(channelId, reconciliation.snapshot);
    applySnapshotToActiveFeed(channelId, reconciliation.snapshot);
    if (shouldFollowLatest) {
      setPendingNewMessageCount(0);
      requestScrollToLatest("auto");
      return;
    }
    setFollowingLatest(false);
    setPendingNewMessageCount((count) => Math.max(count, reconciliation.newMessageCount));
    if (reconciliation.visibleMessagesChanged && scrollAnchor) {
      window.requestAnimationFrame(() => {
        const element = messageScrollRef.current;
        if (!restoreChatFeedScrollAnchor(element, scrollAnchor)) return;
        feedCacheRef.current.set(channelId, rememberFeedScroll(feedCacheRef.current.get(channelId), element?.scrollTop ?? 0));
      });
    }
  }, [
    applySnapshotToActiveFeed,
    isFollowingLatest,
    isMessageScrollNearLatest,
    requestScrollToLatest,
    setFollowingLatest,
  ]);

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

  const applyRealtimeMessageToFeed = useCallback((message: ChatMessage, applyMessageEffects: (message: ChatMessage) => void) => {
    const activeMessageChannelId = activeChannelIdRef.current;
    const isActiveMessage = message.channelId === activeMessageChannelId;
    const currentFeed = isActiveMessage ? feedCacheRef.current.get(message.channelId) : undefined;
    const shouldFollowLatest = shouldFollowIncomingMessage(
      message,
      currentUserIdRef.current,
      isActiveMessage && !currentFeed?.hasNewerMessages && (isFollowingLatest() || isMessageScrollNearLatest()),
    );
    applyMessageToFeed(message);
    applyMessageEffects(message);
    if (isActiveMessage && shouldFollowLatest) {
      if (currentFeed?.hasNewerMessages) {
        void loadLatestMessages("smooth");
      } else {
        requestScrollToLatest("smooth");
      }
    } else if (isActiveMessage && !message.rootMessageId) {
      setPendingNewMessageCount((count) => count + 1);
    }
  }, [applyMessageToFeed, isFollowingLatest, isMessageScrollNearLatest, loadLatestMessages, requestScrollToLatest]);

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
      (anchor.manuallyUnread && manualUnreadAutoReadSuppressedRef.current)
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
    const shouldOpenMainUnread = hasMainFeedUnread(anchor) && !requestedMessageId;
    const cachedHasRequestedMessage = Boolean(
      requestedMessageId &&
      cachedFeed?.messages.some((message) => message.id === requestedMessageId || message.rootMessageId === requestedMessageId),
    );
    const shouldPreserveCachedWindow = !requestedMessageId && shouldPreserveFeedWindow(cachedFeed);
    manualUnreadAutoReadSuppressedRef.current = false;
    cancelPendingReadReceipt();
    setFollowingLatest(!shouldOpenMainUnread && !requestedMessageId && !shouldPreserveCachedWindow);
    setUnreadAnchor(anchor);
    setPendingNewMessageCount(0);
    olderLoadInFlightRef.current = false;
    setFeedChannelId(channelId);
    setMessages(cachedFeed?.messages ?? []);
    setHasNewerMessages(cachedFeed?.hasNewerMessages ?? false);
    setHasOlderMessages(cachedFeed?.hasOlderMessages ?? false);
    setMessagesLoading(
      shouldOpenMainUnread ||
      !cachedFeed ||
      Boolean(requestedMessageId && !cachedHasRequestedMessage),
    );
    if (shouldOpenMainUnread) {
      if (cachedFeed) pendingUnreadScrollRef.current = true;
      void getChatUnreadContext({ anchor, channelId, limit: chatMessagePageSize })
        .then((response) => {
          if (cancelled) return;
          const snapshot = replaceFeedMessages(
            feedCacheRef.current.get(channelId),
            response.messages,
            chatMessagePageSize,
            {
              hasNewerMessages: response.hasNewerMessages,
              hasOlderMessages: response.hasOlderMessages,
              windowKind: "unread",
            },
          );
          feedCacheRef.current.set(channelId, snapshot);
          setFeedChannelId(channelId);
          setMessages(snapshot.messages);
          setHasNewerMessages(snapshot.hasNewerMessages);
          setHasOlderMessages(snapshot.hasOlderMessages);
          pendingUnreadScrollRef.current = true;
        })
        .catch(() => {
          if (cancelled) return;
          if (cachedFeed) return;
          return getChatMessages({ channelId, limit: chatMessagePageSize })
            .then((response) => {
              if (cancelled) return;
              const snapshot = replaceFeedMessages(feedCacheRef.current.get(channelId), response.messages);
              feedCacheRef.current.set(channelId, snapshot);
              setFeedChannelId(channelId);
              setMessages(snapshot.messages);
              setHasNewerMessages(snapshot.hasNewerMessages);
              setHasOlderMessages(snapshot.hasOlderMessages);
              requestScrollToLatest("auto");
            })
            .catch((latestError) => {
              if (!cancelled) notify(latestError instanceof Error ? latestError.message : "加载消息失败");
            });
        })
        .finally(() => {
          if (!cancelled) setMessagesLoading(false);
        });
    } else if (!requestedMessageId && isFreshFeedSnapshot(cachedFeed)) {
      setMessagesLoading(false);
      if (shouldPreserveCachedWindow) {
        setFollowingLatest(false);
      } else if (cachedFeed?.hasNewerMessages) {
        void loadLatestMessages("auto");
      } else {
        requestScrollToLatest("auto");
        void loadLatestMessages("auto");
      }
    } else if (!requestedMessageId) {
      void getChatMessages({ channelId, limit: chatMessagePageSize })
        .then((response) => {
          if (cancelled) return;
          const snapshot = replaceFeedMessages(feedCacheRef.current.get(channelId), response.messages);
          feedCacheRef.current.set(channelId, snapshot);
          setFeedChannelId(channelId);
          setMessages(response.messages);
          setHasNewerMessages(snapshot.hasNewerMessages);
          setHasOlderMessages(snapshot.hasOlderMessages);
          requestScrollToLatest("auto");
        })
        .catch((error) => {
          if (!cancelled) notify(error instanceof Error ? error.message : "加载消息失败");
        })
        .finally(() => {
          if (!cancelled) setMessagesLoading(false);
        });
    } else if (cachedHasRequestedMessage) {
      setMessagesLoading(false);
    }
    return () => {
      cancelled = true;
      cancelPendingReadReceipt();
      rememberActiveFeedScroll(channelId);
    };
  }, [
    activeChannelId,
    cancelPendingReadReceipt,
    currentUserId,
    notify,
    rememberActiveFeedScroll,
    loadLatestMessages,
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
          notify(error instanceof Error ? error.message : "加载目标消息失败");
          onRequestedMessageConsumed();
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
    onThreadTarget,
    requestedMessageId,
  ]);

  useLayoutEffect(() => {
    if (!requestedMessageId || !messages.some((message) => message.id === requestedMessageId || message.rootMessageId === requestedMessageId)) return undefined;
    setFollowingLatest(false);
    return runChatFeedScrollIntent(
      () => scrollChatFeedToMessage(messageScrollRef.current, requestedMessageId, { behavior: "auto", block: "center" }),
      () => {
        onRequestedMessageLocated(requestedMessageId);
        onRequestedMessageConsumed();
      },
      8,
      () => isChatFeedMessageVisible(messageScrollRef.current, requestedMessageId),
    );
  }, [messages, onRequestedMessageConsumed, onRequestedMessageLocated, requestedMessageId, setFollowingLatest]);

  useLayoutEffect(() => {
    if (!pendingUnreadScrollRef.current || messagesLoading) return undefined;
    setFollowingLatest(false);
    return runChatFeedScrollIntent(
      () => scrollChatFeedToUnread(messageScrollRef.current, { behavior: "auto" }),
      () => {
        pendingUnreadScrollRef.current = false;
      },
    );
  }, [messages, messagesLoading, setFollowingLatest]);

  useLayoutEffect(() => {
    scheduleVisibleReadReceipt();
  }, [messages, messagesLoading, scheduleVisibleReadReceipt, unreadAnchor]);

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
        if (restoreChatFeedScrollAnchor(element, scrollAnchor)) {
          feedCacheRef.current.set(activeChannelId, rememberFeedScroll(feedCacheRef.current.get(activeChannelId), element.scrollTop));
          return;
        }
        const nextTop = element.scrollHeight - previousScrollHeight + previousScrollTop;
        element.scrollTop = Math.max(0, nextTop);
        feedCacheRef.current.set(activeChannelId, rememberFeedScroll(feedCacheRef.current.get(activeChannelId), element.scrollTop));
      });
    } catch (error) {
      notify(error instanceof Error ? error.message : "加载更早消息失败");
    } finally {
      olderLoadInFlightRef.current = false;
      setOlderMessagesLoading(false);
    }
  }, [activeChannelId, hasOlderMessages, isLatestScrollPending, messages, notify, setFollowingLatest]);

  const handleMessageScroll = useCallback(() => {
    rememberActiveFeedScroll();
    const nearLatest = handleLatestStickinessScroll();
    if (nearLatest) setPendingNewMessageCount(0);
    if (!isLatestScrollPending()) scheduleVisibleReadReceipt();
    if (!isLatestScrollPending() && isChatFeedNearOldest(messageScrollRef.current)) void loadOlderMessages();
  }, [handleLatestStickinessScroll, isLatestScrollPending, loadOlderMessages, rememberActiveFeedScroll, scheduleVisibleReadReceipt]);

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
      if (scrollChatFeedToUnread(messageScrollRef.current, { behavior: "auto" })) return;
      if (
        target.messageId &&
        scrollChatFeedToMessage(messageScrollRef.current, target.messageId, { behavior: "auto", block: "start", offset: 48 })
      ) {
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
        pendingUnreadScrollRef.current = true;
      }
    } catch (error) {
      if (activeChannelIdRef.current === channelId) {
        notify(error instanceof Error ? error.message : "加载未读消息失败");
      }
    } finally {
      if (target.surface === "main" && activeChannelIdRef.current === channelId) setMessagesLoading(false);
    }
  }, [applySnapshotToActiveFeed, notify, onThreadTarget, setFollowingLatest, unreadAnchor]);

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
    applyRealtimeMessageToFeed,
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
