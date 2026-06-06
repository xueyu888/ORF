import { useCallback, useEffect, useRef, useState } from "react";
import {
  getChatMessageContext,
  getChatMessages,
  getChatUnreadContext,
  markChatChannelReadRequest,
  setChatChannelUnreadRequest,
} from "../../state/apiClient";
import type { ChatChannel, ChatMessage } from "../../types/orf";
import {
  isChatFeedNearLatest,
  isChatFeedNearOldest,
  readChatFeedScrollAnchor,
  restoreChatFeedScrollAnchor,
  scrollChatFeedToLatest,
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
  rememberFeedScroll,
  removeMessageById,
  replaceFeedMessages,
  replacePendingMessage,
  shouldFollowIncomingMessage,
  updatePendingMessageDelivery,
  upsertChannelMessage,
} from "./chatModels";

export type ChatFeedThreadTarget = {
  focusMessageId: string;
  rootMessageId: string;
};

type UseChatFeedStateInput = {
  activeChannel: ChatChannel | null;
  currentUserId?: string;
  notify: (message: string) => void;
  onChannelUpdate: (channel: ChatChannel) => void;
  onRequestedMessageConsumed: () => void;
  onRequestedMessageRedirect: (messageId: string) => void;
  onThreadTarget: (target: ChatFeedThreadTarget) => void;
  requestedMessageId: string | null;
};

export function useChatFeedState({
  activeChannel,
  currentUserId,
  notify,
  onChannelUpdate,
  onRequestedMessageConsumed,
  onRequestedMessageRedirect,
  onThreadTarget,
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
  const currentUserIdRef = useRef<string | undefined>(undefined);
  const contextRequestKeyRef = useRef<string | null>(null);
  const feedCacheRef = useRef(new Map<string, ReturnType<typeof createFeedSnapshot>>());
  const messageScrollRef = useRef<HTMLDivElement | null>(null);
  const olderLoadInFlightRef = useRef(false);
  const pendingLatestScrollRef = useRef<ScrollBehavior | null>(null);
  const pendingUnreadScrollRef = useRef(false);
  const shouldStickToLatestRef = useRef(true);
  const prefetchRequestsRef = useRef(new Map<string, Promise<boolean>>());
  const activeChannelId = activeChannel?.id ?? null;
  activeChannelIdRef.current = activeChannelId;
  currentUserIdRef.current = currentUserId;

  const requestScrollToLatest = useCallback((behavior: ScrollBehavior = "smooth") => {
    shouldStickToLatestRef.current = true;
    pendingLatestScrollRef.current = behavior;
    setPendingNewMessageCount(0);
  }, []);

  const rememberActiveFeedScroll = useCallback((channelId = activeChannelIdRef.current) => {
    const element = messageScrollRef.current;
    if (!channelId || !element) return;
    feedCacheRef.current.set(channelId, rememberFeedScroll(feedCacheRef.current.get(channelId), element.scrollTop));
  }, []);

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
    setMessagesLoading(true);
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
  }, [applySnapshotToActiveFeed, notify, requestScrollToLatest]);

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
      isActiveMessage && !currentFeed?.hasNewerMessages && (shouldStickToLatestRef.current || isMessageScrollNearLatest()),
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
  }, [applyMessageToFeed, isMessageScrollNearLatest, loadLatestMessages, requestScrollToLatest]);

  // Rebuild the feed only when the channel identity changes; mark-read channel updates must not erase the unread anchor.
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
    shouldStickToLatestRef.current = !shouldOpenMainUnread && !requestedMessageId;
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
      Boolean(requestedMessageId && !cachedHasRequestedMessage) ||
      (!requestedMessageId && !isFreshFeedSnapshot(cachedFeed)),
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
      if (cachedFeed?.hasNewerMessages) {
        void loadLatestMessages("auto");
      } else {
        requestScrollToLatest("auto");
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
    void markChatChannelReadRequest(channelId)
      .then((response) => onChannelUpdate(response.channel))
      .catch(() => undefined);
    return () => {
      cancelled = true;
      rememberActiveFeedScroll(channelId);
    };
  }, [
    activeChannelId,
    currentUserId,
    notify,
    onChannelUpdate,
    rememberActiveFeedScroll,
    loadLatestMessages,
    requestScrollToLatest,
    requestedMessageId,
  ]);

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

  useEffect(() => {
    if (!requestedMessageId || !messages.some((message) => message.id === requestedMessageId || message.rootMessageId === requestedMessageId)) return undefined;
    const timer = window.setTimeout(() => {
      shouldStickToLatestRef.current = false;
      scrollChatFeedToMessage(messageScrollRef.current, requestedMessageId, { behavior: "smooth", block: "center" });
      onRequestedMessageConsumed();
    }, 120);
    return () => window.clearTimeout(timer);
  }, [messages, onRequestedMessageConsumed, requestedMessageId]);

  useEffect(() => {
    if (!pendingUnreadScrollRef.current || messagesLoading) return undefined;
    const timer = window.setTimeout(() => {
      shouldStickToLatestRef.current = false;
      scrollChatFeedToUnread(messageScrollRef.current, { behavior: "auto" });
      pendingUnreadScrollRef.current = false;
    }, 120);
    return () => window.clearTimeout(timer);
  }, [messages, messagesLoading]);

  useEffect(() => {
    const behavior = pendingLatestScrollRef.current;
    if (!behavior || messagesLoading) return;
    let cancelled = false;
    let clearTimer: number | null = null;
    let remainingAttempts = behavior === "auto" ? 3 : 1;
    const scrollLatest = () => {
      if (cancelled) return;
      scrollChatFeedToLatest(messageScrollRef.current, behavior);
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
  }, [activeChannelId, messages, messagesLoading]);

  useEffect(() => {
    const element = messageScrollRef.current;
    if (!element || typeof ResizeObserver === "undefined" || typeof MutationObserver === "undefined") return undefined;

    let observedContent: Element | null = null;
    let frame: number | null = null;
    const resizeObserver = new ResizeObserver(() => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        frame = null;
        if (messagesLoading) return;
        if (!pendingLatestScrollRef.current && !shouldStickToLatestRef.current) return;
        if (scrollChatFeedToLatest(element, "auto")) {
          rememberActiveFeedScroll(activeChannelIdRef.current);
        }
      });
    });
    const observeMessageList = () => {
      const content = element.querySelector(".orf-chat-message-list");
      if (content === observedContent) return;
      if (observedContent) resizeObserver.unobserve(observedContent);
      observedContent = content;
      if (observedContent) resizeObserver.observe(observedContent);
    };
    observeMessageList();
    const mutationObserver = new MutationObserver(observeMessageList);
    mutationObserver.observe(element, { childList: true });
    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      mutationObserver.disconnect();
      resizeObserver.disconnect();
    };
  }, [activeChannelId, messagesLoading, rememberActiveFeedScroll]);

  const loadOlderMessages = useCallback(async () => {
    if (!activeChannelId || messages.length === 0 || olderLoadInFlightRef.current || pendingLatestScrollRef.current || !hasOlderMessages) return;
    shouldStickToLatestRef.current = false;
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
  }, [activeChannelId, hasOlderMessages, messages, notify]);

  const handleMessageScroll = useCallback(() => {
    rememberActiveFeedScroll();
    const nearLatest = isMessageScrollNearLatest();
    if (pendingLatestScrollRef.current) {
      if (nearLatest) setPendingNewMessageCount(0);
      return;
    }
    shouldStickToLatestRef.current = nearLatest;
    if (nearLatest) setPendingNewMessageCount(0);
    if (!pendingLatestScrollRef.current && isChatFeedNearOldest(messageScrollRef.current)) void loadOlderMessages();
  }, [isMessageScrollNearLatest, loadOlderMessages, rememberActiveFeedScroll]);

  const markActiveChannelUnread = useCallback(async () => {
    if (!activeChannelId) return;
    const response = await setChatChannelUnreadRequest({ channelId: activeChannelId });
    onChannelUpdate(response.channel);
    const member = currentMembership(response.channel, currentUserIdRef.current);
    setUnreadAnchor({
      channelId: response.channel.id,
      lastReadAt: member?.lastReadAt ?? null,
      lastReadMessageId: member?.lastReadMessageId ?? null,
      manuallyUnread: true,
      mentionCount: response.channel.mentionCount,
      threadUnreadCount: response.channel.threadUnreadCount,
      unreadCount: response.channel.unreadCount,
    });
  }, [activeChannelId, onChannelUpdate]);

  const clearActiveChannelUnread = useCallback(async () => {
    const channelId = activeChannelIdRef.current;
    if (!channelId) return;
    try {
      const response = await markChatChannelReadRequest(channelId, { includeThreads: true });
      if (activeChannelIdRef.current !== channelId) return;
      onChannelUpdate(response.channel);
      setUnreadAnchor(null);
    } catch (error) {
      if (activeChannelIdRef.current === channelId) {
        notify(error instanceof Error ? error.message : "标记已读失败");
      }
    }
  }, [notify, onChannelUpdate]);

  const markMessageUnread = useCallback(async (message: ChatMessage) => {
    const response = await setChatChannelUnreadRequest({ channelId: message.channelId, messageId: message.id });
    onChannelUpdate(response.channel);
    if (message.channelId !== activeChannelIdRef.current) return;
    const member = currentMembership(response.channel, currentUserIdRef.current);
    setUnreadAnchor({
      channelId: response.channel.id,
      lastReadAt: member?.lastReadAt ?? null,
      lastReadMessageId: member?.lastReadMessageId ?? null,
      manuallyUnread: true,
      mentionCount: response.channel.mentionCount,
      threadUnreadCount: response.channel.threadUnreadCount,
      unreadCount: response.channel.unreadCount,
    });
  }, [onChannelUpdate]);

  const jumpToUnread = useCallback(async (target: ChatUnreadJumpTarget) => {
    const channelId = activeChannelIdRef.current;
    if (!channelId) return;
    shouldStickToLatestRef.current = false;
    if (!target.contextRequired) {
      if (scrollChatFeedToUnread(messageScrollRef.current, { behavior: "auto" })) return;
      if (
        target.messageId &&
        scrollChatFeedToMessage(messageScrollRef.current, target.messageId, { behavior: "auto", block: "start", offset: 48 })
      ) {
        return;
      }
    }

    setMessagesLoading(true);
    try {
      const response = await getChatUnreadContext({ anchor: unreadAnchor, channelId, limit: chatMessagePageSize });
      if (activeChannelIdRef.current !== channelId) return;
      const snapshot = replaceFeedMessages(
        feedCacheRef.current.get(channelId),
        response.messages,
        chatMessagePageSize,
        {
          hasNewerMessages: response.hasNewerMessages,
          hasOlderMessages: response.hasOlderMessages,
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
      if (activeChannelIdRef.current === channelId) setMessagesLoading(false);
    }
  }, [applySnapshotToActiveFeed, notify, unreadAnchor]);

  const loadLatestOrScroll = useCallback(() => {
    if (hasNewerMessages) {
      void loadLatestMessages("smooth");
    } else {
      requestScrollToLatest("smooth");
    }
  }, [hasNewerMessages, loadLatestMessages, requestScrollToLatest]);

  const syncLatestMessagesIfFollowing = useCallback(() => {
    const channelId = activeChannelIdRef.current;
    if (!channelId) return;
    const snapshot = feedCacheRef.current.get(channelId);
    if (snapshot?.hasNewerMessages || (!shouldStickToLatestRef.current && !isMessageScrollNearLatest())) return;
    void loadLatestMessages("auto");
  }, [isMessageScrollNearLatest, loadLatestMessages]);

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
      : !activeFeedSnapshot || !isFreshFeedSnapshot(activeFeedSnapshot);

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
    removePendingMessageFromFeed,
    requestScrollToLatest,
    resolvePendingMessageInFeed,
    syncLatestMessagesIfFollowing,
    unreadAnchor,
  };
}
