import { useCallback, useEffect, useRef, useState } from "react";
import {
  getChatMessageContext,
  getChatMessages,
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
  chatMessagePageSize,
  createFeedSnapshot,
  currentMembership,
  prependOlderFeedMessages,
  rememberFeedScroll,
  replaceFeedMessages,
  shouldFollowIncomingMessage,
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
  const activeChannelIdRef = useRef<string | null>(null);
  const currentUserIdRef = useRef<string | undefined>(undefined);
  const contextRequestKeyRef = useRef<string | null>(null);
  const feedCacheRef = useRef(new Map<string, ReturnType<typeof createFeedSnapshot>>());
  const messageScrollRef = useRef<HTMLDivElement | null>(null);
  const olderLoadInFlightRef = useRef(false);
  const pendingLatestScrollRef = useRef<ScrollBehavior | null>(null);
  const activeChannelId = activeChannel?.id ?? null;
  activeChannelIdRef.current = activeChannelId;
  currentUserIdRef.current = currentUserId;

  const requestScrollToLatest = useCallback((behavior: ScrollBehavior = "smooth") => {
    pendingLatestScrollRef.current = behavior;
    setPendingNewMessageCount(0);
  }, []);

  const rememberActiveFeedScroll = useCallback((channelId = activeChannelIdRef.current) => {
    const element = messageScrollRef.current;
    if (!channelId || !element) return;
    feedCacheRef.current.set(channelId, rememberFeedScroll(feedCacheRef.current.get(channelId), element.scrollTop));
  }, []);

  const restoreFeedScroll = useCallback((scrollTop: number) => {
    window.requestAnimationFrame(() => {
      const element = messageScrollRef.current;
      if (!element) return;
      element.scrollTop = Math.max(0, scrollTop);
    });
  }, []);

  const isMessageScrollNearLatest = useCallback(() => {
    return isChatFeedNearLatest(messageScrollRef.current);
  }, []);

  const applyMessageToFeed = useCallback((message: ChatMessage) => {
    if (activeChannelIdRef.current === message.channelId) {
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

  const loadLatestMessages = useCallback(async (behavior: ScrollBehavior = "smooth") => {
    const channelId = activeChannelIdRef.current;
    if (!channelId) return;
    setMessagesLoading(true);
    try {
      const response = await getChatMessages({ channelId, limit: chatMessagePageSize });
      const snapshot = replaceFeedMessages(feedCacheRef.current.get(channelId), response.messages);
      feedCacheRef.current.set(channelId, snapshot);
      setMessages(snapshot.messages);
      setHasNewerMessages(snapshot.hasNewerMessages);
      setHasOlderMessages(snapshot.hasOlderMessages);
      requestScrollToLatest(behavior);
    } catch (error) {
      notify(error instanceof Error ? error.message : "加载最新消息失败");
    } finally {
      setMessagesLoading(false);
    }
  }, [notify, requestScrollToLatest]);

  const applyRealtimeMessageToFeed = useCallback((message: ChatMessage, applyMessageEffects: (message: ChatMessage) => void) => {
    const activeMessageChannelId = activeChannelIdRef.current;
    const isActiveMessage = message.channelId === activeMessageChannelId;
    const currentFeed = isActiveMessage ? feedCacheRef.current.get(message.channelId) : undefined;
    const shouldFollowLatest = shouldFollowIncomingMessage(
      message,
      currentUserIdRef.current,
      isActiveMessage && !currentFeed?.hasNewerMessages && isMessageScrollNearLatest(),
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
    const cachedHasRequestedMessage = Boolean(
      requestedMessageId &&
      cachedFeed?.messages.some((message) => message.id === requestedMessageId || message.rootMessageId === requestedMessageId),
    );
    setUnreadAnchor(anchor);
    setPendingNewMessageCount(0);
    olderLoadInFlightRef.current = false;
    setMessages(cachedFeed?.messages ?? []);
    setHasNewerMessages(cachedFeed?.hasNewerMessages ?? false);
    setHasOlderMessages(cachedFeed?.hasOlderMessages ?? false);
    setMessagesLoading(!cachedFeed || Boolean(requestedMessageId && !cachedHasRequestedMessage));
    if (cachedFeed) restoreFeedScroll(cachedFeed.scrollTop);
    if (!requestedMessageId) {
      void getChatMessages({ channelId, limit: chatMessagePageSize })
        .then((response) => {
          if (cancelled) return;
          const currentScrollTop = messageScrollRef.current?.scrollTop ?? cachedFeed?.scrollTop ?? 0;
          const snapshot = replaceFeedMessages(
            cachedFeed ? rememberFeedScroll(cachedFeed, currentScrollTop) : createFeedSnapshot({ scrollTop: currentScrollTop }),
            response.messages,
          );
          feedCacheRef.current.set(channelId, snapshot);
          setMessages(response.messages);
          setHasNewerMessages(snapshot.hasNewerMessages);
          setHasOlderMessages(snapshot.hasOlderMessages);
          if (!cachedFeed && !anchor) {
            requestScrollToLatest("auto");
          } else if (cachedFeed) {
            restoreFeedScroll(snapshot.scrollTop);
          }
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
    requestScrollToLatest,
    requestedMessageId,
    restoreFeedScroll,
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
      scrollChatFeedToMessage(messageScrollRef.current, requestedMessageId, { behavior: "smooth", block: "center" });
      onRequestedMessageConsumed();
    }, 120);
    return () => window.clearTimeout(timer);
  }, [messages, onRequestedMessageConsumed, requestedMessageId]);

  useEffect(() => {
    const behavior = pendingLatestScrollRef.current;
    if (!behavior || messagesLoading) return;
    window.requestAnimationFrame(() => {
      scrollChatFeedToLatest(messageScrollRef.current, behavior);
      pendingLatestScrollRef.current = null;
    });
  }, [activeChannelId, messages, messagesLoading]);

  const loadOlderMessages = useCallback(async () => {
    if (!activeChannelId || messages.length === 0 || olderLoadInFlightRef.current || pendingLatestScrollRef.current || !hasOlderMessages) return;
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
    if (isMessageScrollNearLatest()) setPendingNewMessageCount(0);
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
      manuallyUnread: true,
      mentionCount: response.channel.mentionCount,
      threadUnreadCount: response.channel.threadUnreadCount,
      unreadCount: response.channel.unreadCount,
    });
  }, [activeChannelId, onChannelUpdate]);

  const markMessageUnread = useCallback(async (message: ChatMessage) => {
    const response = await setChatChannelUnreadRequest({ channelId: message.channelId, messageId: message.id });
    onChannelUpdate(response.channel);
    if (message.channelId !== activeChannelIdRef.current) return;
    const member = currentMembership(response.channel, currentUserIdRef.current);
    setUnreadAnchor({
      channelId: response.channel.id,
      lastReadAt: member?.lastReadAt ?? null,
      manuallyUnread: true,
      mentionCount: response.channel.mentionCount,
      threadUnreadCount: response.channel.threadUnreadCount,
      unreadCount: response.channel.unreadCount,
    });
  }, [onChannelUpdate]);

  const jumpToUnread = useCallback((messageId?: string | null) => {
    if (messageId && scrollChatFeedToMessage(messageScrollRef.current, messageId, { behavior: "smooth", block: "start", offset: 48 })) return;
    scrollChatFeedToUnread(messageScrollRef.current, { behavior: "smooth" });
  }, []);

  const loadLatestOrScroll = useCallback(() => {
    if (hasNewerMessages) {
      void loadLatestMessages("smooth");
    } else {
      requestScrollToLatest("smooth");
    }
  }, [hasNewerMessages, loadLatestMessages, requestScrollToLatest]);

  return {
    applyMessageToFeed,
    applyRealtimeMessageToFeed,
    handleMessageScroll,
    hasNewerMessages,
    hasOlderMessages,
    jumpToUnread,
    loadLatestMessages,
    loadLatestOrScroll,
    loadOlderMessages,
    markActiveChannelUnread,
    markMessageUnread,
    messageScrollRef,
    messages,
    messagesLoading,
    olderMessagesLoading,
    pendingNewMessageCount,
    requestScrollToLatest,
    unreadAnchor,
  };
}
