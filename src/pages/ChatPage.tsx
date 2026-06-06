import { clsx } from "clsx";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ChatComposer } from "../features/chat/ChatComposer";
import { AttachmentPreview, ChannelModal, ConversationModal, EditMessageDialog } from "../features/chat/ChatDialogs";
import { ChatHeader } from "../features/chat/ChatHeader";
import { ChatMessageFeed } from "../features/chat/ChatMessageFeed";
import { ChatRightPanel, type ActivePanel, type ChatSearchScope, type ChatSearchTypeFilter } from "../features/chat/ChatRightPanel";
import { ChatSidebar } from "../features/chat/ChatSidebar";
import { ChatTypingLine } from "../features/chat/ChatTypingLine";
import { isChatFeedNearLatest, scrollChatFeedToLatest, scrollChatFeedToMessage, scrollChatFeedToUnread } from "../features/chat/chatFeedScroll";
import {
  type ChatDraft,
  type UnreadAnchor,
  applyThreadSummaryMessage,
  applyFeedMessage,
  buildUnreadAnchor,
  chatMessagePageSize,
  createFeedSnapshot,
  currentMembership,
  draftFromStoredBody,
  hasStoredDraftForChannel,
  prependOlderFeedMessages,
  rememberFeedScroll,
  replaceFeedMessages,
  serializeDraft,
  shouldFollowIncomingMessage,
  sortChannels,
  storedDraftChannelIds,
  upsertChannel,
  upsertMessage,
} from "../features/chat/chatModels";
import {
  addChatChannelMembersRequest,
  archiveChatChannelRequest,
  createChatChannel,
  deleteChatMessageRequest,
  getChatBootstrap,
  getChatMentionableUsers,
  getChatMessageContext,
  getChatMessages,
  getChatThread,
  getChatThreads,
  getPinnedChatMessages,
  getSavedChatMessages,
  markChatChannelReadRequest,
  openChatConversation,
  publishChatTypingRequest,
  removeChatChannelMemberRequest,
  searchChat,
  sendChatMessageRequest,
  setChatChannelUnreadRequest,
  setChatReactionRequest,
  setChatMessagePinRequest,
  setChatMessageSavedRequest,
  setChatThreadFollowRequest,
  updateChatChannelRequest,
  updateChatMessageRequest,
} from "../state/apiClient";
import { useOrf } from "../state/OrfProvider";
import type { ChatAttachment, ChatBootstrap, ChatChannel, ChatMessage, ChatSearchResult, ChatThread, ChatThreadSummary, ChatUser } from "../types/orf";
import type { ChatRealtimeEvent } from "../types/realtime";

type TypingState = {
  expiresAt: string;
  userId: string;
  userName: string;
};

type PendingThreadTarget = {
  focusMessageId: string;
  rootMessageId: string;
};

function parseRealtimeEvent(raw: string): ChatRealtimeEvent | null {
  try {
    const event = JSON.parse(raw) as ChatRealtimeEvent;
    return event.kind === "chat.event" ? event : null;
  } catch {
    return null;
  }
}

export function ChatPage() {
  const { channelId: routeChannelId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { currentUser, notify } = useOrf();
  const [bootstrap, setBootstrap] = useState<ChatBootstrap | null>(null);
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);
  const [thread, setThread] = useState<ChatThread | null>(null);
  const [threadFocusMessageId, setThreadFocusMessageId] = useState<string | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [pendingThreadTarget, setPendingThreadTarget] = useState<PendingThreadTarget | null>(null);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [olderMessagesLoading, setOlderMessagesLoading] = useState(false);
  const [hasNewerMessages, setHasNewerMessages] = useState(false);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [channelQuery, setChannelQuery] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchScope, setSearchScope] = useState<ChatSearchScope>("all");
  const [searchType, setSearchType] = useState<ChatSearchTypeFilter>("all");
  const [modal, setModal] = useState<"channel" | "conversation" | null>(null);
  const [searchResults, setSearchResults] = useState<ChatSearchResult[]>([]);
  const [collectionResults, setCollectionResults] = useState<ChatSearchResult[]>([]);
  const [collectionLoading, setCollectionLoading] = useState(false);
  const [threadSummaries, setThreadSummaries] = useState<ChatThreadSummary[]>([]);
  const [threadSummariesLoading, setThreadSummariesLoading] = useState(false);
  const [draftChannelIds, setDraftChannelIds] = useState<Set<string>>(new Set());
  const [typingByUser, setTypingByUser] = useState<Map<string, TypingState>>(new Map());
  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);
  const [attachmentPreview, setAttachmentPreview] = useState<ChatAttachment | null>(null);
  const [pendingNewMessageCount, setPendingNewMessageCount] = useState(0);
  const [unreadAnchor, setUnreadAnchor] = useState<UnreadAnchor | null>(null);
  const lastTypingSentAtRef = useRef(0);
  const activeChannelIdRef = useRef<string | null>(null);
  const currentUserIdRef = useRef<string | undefined>(undefined);
  const contextRequestKeyRef = useRef<string | null>(null);
  const feedCacheRef = useRef(new Map<string, ReturnType<typeof createFeedSnapshot>>());
  const messageScrollRef = useRef<HTMLDivElement | null>(null);
  const pendingLatestScrollRef = useRef<ScrollBehavior | null>(null);
  const activeChannel = routeChannelId ? channels.find((channel) => channel.id === routeChannelId) ?? null : channels[0] ?? null;
  activeChannelIdRef.current = activeChannel?.id ?? null;
  currentUserIdRef.current = currentUser?.id;
  const usersById = useMemo(() => new Map((bootstrap?.users ?? []).map((user) => [user.id, user])), [bootstrap?.users]);
  const activeMentionableUsers = useMemo(() => {
    if (!activeChannel) return [];
    const memberIds = new Set(activeChannel.members.map((member) => member.userId));
    return (bootstrap?.users ?? []).filter((user) => memberIds.has(user.id));
  }, [activeChannel, bootstrap?.users]);
  const myMembership = currentMembership(activeChannel, currentUser?.id);
  const canManageActiveChannel =
    Boolean(bootstrap?.permissions.canManageAnyChannel || bootstrap?.permissions.canManageAnyMembers) ||
    myMembership?.role === "owner" ||
    myMembership?.role === "admin";
  const focusMessageId = searchParams.get("message");

  const applyChannel = useCallback((channel: ChatChannel) => {
    setChannels((items) => upsertChannel(items, channel, currentUser?.id));
  }, [currentUser?.id]);

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

  const handleMessageScroll = useCallback(() => {
    rememberActiveFeedScroll();
    if (isMessageScrollNearLatest()) setPendingNewMessageCount(0);
  }, [isMessageScrollNearLatest, rememberActiveFeedScroll]);

  const applyMessage = useCallback((message: ChatMessage) => {
    if (activeChannelIdRef.current === message.channelId) {
      setMessages((items) => {
        const snapshot = applyFeedMessage(feedCacheRef.current.get(message.channelId) ?? createFeedSnapshot({ messages: items }), message);
        if (!snapshot) return items;
        feedCacheRef.current.set(message.channelId, snapshot);
        const next = snapshot.messages;
        return next;
      });
    } else {
      const snapshot = applyFeedMessage(feedCacheRef.current.get(message.channelId), message);
      if (snapshot) feedCacheRef.current.set(message.channelId, snapshot);
    }
    setThread((item) => {
      if (!item) return item;
      const isOpenRoot = item.rootMessage.id === message.id;
      const isOpenReply = message.rootMessageId === item.rootMessage.id;
      if (!isOpenRoot && !isOpenReply) return item;
      return {
        ...item,
        rootMessage: isOpenRoot ? message : item.rootMessage,
        replies: isOpenReply
          ? upsertMessage(item.replies, message).filter((reply) => reply.rootMessageId === item.rootMessage.id)
          : item.replies,
      };
    });
    setThreadSummaries((items) => applyThreadSummaryMessage(
      items,
      message,
      currentUser?.id,
      activePanel === "thread" ? thread?.rootMessage.id : null,
    ));
    setSearchResults((items) => items.map((result) => (result.message.id === message.id ? { ...result, message } : result)));
    setCollectionResults((items) => items.map((result) => (result.message.id === message.id ? { ...result, message } : result)));
  }, [activePanel, currentUser?.id, thread?.rootMessage.id]);

  const refreshBootstrap = useCallback(async () => {
    const data = await getChatBootstrap();
    setBootstrap(data);
    setChannels(sortChannels(data.channels, currentUser?.id));
    return data;
  }, [currentUser?.id]);

  const handleDraftStateChange = useCallback((channelId: string, hasDraft: boolean) => {
    setDraftChannelIds((items) => {
      const next = new Set(items);
      if (hasDraft) {
        next.add(channelId);
      } else if (!hasStoredDraftForChannel(channelId)) {
        next.delete(channelId);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void refreshBootstrap()
      .catch((error) => {
        if (!cancelled) notify(error instanceof Error ? error.message : "加载聊天失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [notify, refreshBootstrap]);

  useEffect(() => {
    if (loading || channels.length === 0) return;
    const routeChannelExists = routeChannelId ? channels.some((channel) => channel.id === routeChannelId) : false;
    if (!routeChannelId || !routeChannelExists) {
      navigate(`/chat/${encodeURIComponent(channels[0].id)}`, { replace: true });
    }
  }, [channels, loading, navigate, routeChannelId]);

  useEffect(() => {
    setDraftChannelIds(storedDraftChannelIds(channels));
  }, [channels]);

  useEffect(() => {
    if (!activeChannel) return undefined;
    let cancelled = false;
    lastTypingSentAtRef.current = 0;
    const channelId = activeChannel.id;
    const anchor = buildUnreadAnchor(activeChannel, currentUser?.id);
    const cachedFeed = feedCacheRef.current.get(channelId);
    const requestedMessageId = new URLSearchParams(window.location.search).get("message");
    const cachedHasRequestedMessage = Boolean(
      requestedMessageId &&
      cachedFeed?.messages.some((message) => message.id === requestedMessageId || message.rootMessageId === requestedMessageId),
    );
    setUnreadAnchor(anchor);
    setPendingNewMessageCount(0);
    setMessages(cachedFeed?.messages ?? []);
    setHasNewerMessages(cachedFeed?.hasNewerMessages ?? false);
    setHasOlderMessages(cachedFeed?.hasOlderMessages ?? false);
    setMessagesLoading(!cachedFeed || Boolean(requestedMessageId && !cachedHasRequestedMessage));
    if (cachedFeed) restoreFeedScroll(cachedFeed.scrollTop);
    if (!requestedMessageId) {
      void getChatMessages({ channelId, limit: chatMessagePageSize })
        .then((response) => {
          if (!cancelled) {
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
          }
        })
        .catch((error) => notify(error instanceof Error ? error.message : "加载消息失败"))
        .finally(() => {
          if (!cancelled) setMessagesLoading(false);
        });
    } else if (cachedHasRequestedMessage) {
      setMessagesLoading(false);
    }
    void markChatChannelReadRequest(channelId)
      .then((response) => applyChannel(response.channel))
      .catch(() => undefined);
    return () => {
      cancelled = true;
      rememberActiveFeedScroll(channelId);
    };
  }, [activeChannel?.id, applyChannel, currentUser?.id, notify, rememberActiveFeedScroll, requestScrollToLatest, restoreFeedScroll]);

  const handleTyping = useCallback(() => {
    if (!activeChannel) return;
    const currentTime = Date.now();
    if (currentTime - lastTypingSentAtRef.current < 2500) return;
    lastTypingSentAtRef.current = currentTime;
    void publishChatTypingRequest(activeChannel.id).catch(() => undefined);
  }, [activeChannel]);

  useEffect(() => {
    const requestedMessageId = searchParams.get("message");
    const activeChannelId = activeChannel?.id;
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
          setPendingThreadTarget({ focusMessageId: requestedMessageId, rootMessageId: response.targetMessageId });
          setSearchParams((params) => {
            params.set("message", response.targetMessageId);
            return params;
          }, { replace: true });
        }
      })
      .catch((error) => {
        if (!cancelled) {
          notify(error instanceof Error ? error.message : "加载目标消息失败");
          setSearchParams((params) => {
            params.delete("message");
            return params;
          }, { replace: true });
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
  }, [activeChannel?.id, messages, notify, searchParams, setSearchParams]);

  useEffect(() => {
    const requestedMessageId = searchParams.get("message");
    if (!requestedMessageId || !messages.some((message) => message.id === requestedMessageId || message.rootMessageId === requestedMessageId)) return;
    window.setTimeout(() => {
      scrollChatFeedToMessage(messageScrollRef.current, requestedMessageId, { behavior: "smooth", block: "center" });
      setSearchParams((params) => {
        params.delete("message");
        return params;
      }, { replace: true });
    }, 120);
  }, [messages, searchParams, setSearchParams]);

  useEffect(() => {
    const behavior = pendingLatestScrollRef.current;
    if (!behavior || messagesLoading) return;
    pendingLatestScrollRef.current = null;
    window.requestAnimationFrame(() => {
      scrollChatFeedToLatest(messageScrollRef.current, behavior);
    });
  }, [activeChannel?.id, messages, messagesLoading]);

  const loadLatestMessages = useCallback(async (behavior: ScrollBehavior = "smooth") => {
    const channelId = activeChannel?.id;
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
  }, [activeChannel?.id, notify, requestScrollToLatest]);

  const applyChannelRef = useRef(applyChannel);
  const applyMessageRef = useRef(applyMessage);
  const isMessageScrollNearLatestRef = useRef(isMessageScrollNearLatest);
  const loadLatestMessagesRef = useRef(loadLatestMessages);
  const navigateRef = useRef(navigate);
  const requestScrollToLatestRef = useRef(requestScrollToLatest);

  useEffect(() => {
    applyChannelRef.current = applyChannel;
    applyMessageRef.current = applyMessage;
    isMessageScrollNearLatestRef.current = isMessageScrollNearLatest;
    loadLatestMessagesRef.current = loadLatestMessages;
    navigateRef.current = navigate;
    requestScrollToLatestRef.current = requestScrollToLatest;
  }, [applyChannel, applyMessage, isMessageScrollNearLatest, loadLatestMessages, navigate, requestScrollToLatest]);

  useEffect(() => {
    if (typeof EventSource === "undefined") return undefined;
    const source = new EventSource("/api/events", { withCredentials: true });
    const handleChatEvent = (event: MessageEvent<string>) => {
      const payload = parseRealtimeEvent(event.data);
      if (!payload) return;
      const activeChannelId = activeChannelIdRef.current;
      const currentUserId = currentUserIdRef.current;
      if (payload.channel) applyChannelRef.current(payload.channel);
      if (payload.eventType === "channel.archived") {
        setChannels((items) => items.filter((channel) => channel.id !== payload.channelId));
        if (payload.channelId === activeChannelId) navigateRef.current("/chat", { replace: true });
      }
      if (payload.eventType === "member.changed" && payload.channel) {
        applyChannelRef.current(payload.channel);
      }
      if (payload.message) {
        const isActiveMessage = payload.message.channelId === activeChannelId;
        const currentFeed = isActiveMessage ? feedCacheRef.current.get(payload.message.channelId) : undefined;
        const shouldFollowLatest = shouldFollowIncomingMessage(
          payload.message,
          currentUserId,
          isActiveMessage && !currentFeed?.hasNewerMessages && isMessageScrollNearLatestRef.current(),
        );
        applyMessageRef.current(payload.message);
        if (isActiveMessage && shouldFollowLatest) {
          if (currentFeed?.hasNewerMessages) {
            void loadLatestMessagesRef.current("smooth");
          } else {
            requestScrollToLatestRef.current("smooth");
          }
        } else if (isActiveMessage && !payload.message.rootMessageId) {
          setPendingNewMessageCount((count) => count + 1);
        }
      }
      if (payload.eventType === "typing" && payload.channelId === activeChannelId && payload.typing && payload.typing.userId !== currentUserId) {
        setTypingByUser((items) => {
          const next = new Map(items);
          next.set(payload.typing!.userId, payload.typing!);
          return next;
        });
      }
    };
    source.addEventListener("chat.event", handleChatEvent);
    return () => {
      source.removeEventListener("chat.event", handleChatEvent);
      source.close();
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = Date.now();
      setTypingByUser((items) => {
        const next = new Map(items);
        for (const [userId, typing] of next) {
          if (new Date(typing.expiresAt).getTime() <= now) next.delete(userId);
        }
        return next;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const openThread = useCallback(
    async (rootMessageId: string, focusMessageId?: string | null) => {
      setActivePanel("thread");
      setThreadFocusMessageId(focusMessageId ?? null);
      setThreadLoading(true);
      try {
        const response = await getChatThread(rootMessageId);
        setThread(response.thread);
      } catch (error) {
        setThread(null);
        setThreadFocusMessageId(null);
        notify(error instanceof Error ? error.message : "加载线程失败");
      } finally {
        setThreadLoading(false);
      }
    },
    [notify],
  );

  useEffect(() => {
    if (!pendingThreadTarget) return;
    void openThread(pendingThreadTarget.rootMessageId, pendingThreadTarget.focusMessageId);
    setPendingThreadTarget(null);
  }, [openThread, pendingThreadTarget]);

  const loadOlderMessages = useCallback(async () => {
    if (!activeChannel || messages.length === 0 || olderMessagesLoading || !hasOlderMessages) return;
    const scrollElement = messageScrollRef.current;
    const previousScrollHeight = scrollElement?.scrollHeight ?? 0;
    const previousScrollTop = scrollElement?.scrollTop ?? 0;
    setOlderMessagesLoading(true);
    try {
      const channelId = activeChannel.id;
      const response = await getChatMessages({ channelId, before: messages[0].createdAt, limit: chatMessagePageSize });
      setMessages((items) => {
        const snapshot = prependOlderFeedMessages(
          feedCacheRef.current.get(channelId) ?? createFeedSnapshot({ messages: items, scrollTop: previousScrollTop }),
          response.messages,
        );
        feedCacheRef.current.set(channelId, snapshot);
        setHasNewerMessages(snapshot.hasNewerMessages);
        setHasOlderMessages(snapshot.hasOlderMessages);
        return snapshot.messages;
      });
      window.requestAnimationFrame(() => {
        const element = messageScrollRef.current;
        if (!element) return;
        const nextTop = element.scrollHeight - previousScrollHeight + previousScrollTop;
        element.scrollTop = Math.max(0, nextTop);
        feedCacheRef.current.set(channelId, rememberFeedScroll(feedCacheRef.current.get(channelId), element.scrollTop));
      });
    } catch (error) {
      notify(error instanceof Error ? error.message : "加载更早消息失败");
    } finally {
      setOlderMessagesLoading(false);
    }
  }, [activeChannel, hasOlderMessages, messages, notify, olderMessagesLoading]);

  const handleSendMessage = useCallback(
    async (draft: ChatDraft, attachments: ChatAttachment[], rootMessageId?: string | null, parentMessageId?: string | null) => {
      if (!activeChannel) return;
      const response = await sendChatMessageRequest({
        channelId: activeChannel.id,
        body: serializeDraft(draft),
        attachmentIds: attachments.map((attachment) => attachment.id),
        rootMessageId,
        parentMessageId,
      });
      applyChannel(response.channel);
      if (rootMessageId) {
        setThread((item) => item ? { ...item, replies: upsertMessage(item.replies, response.message) } : item);
      } else {
        if (hasNewerMessages) {
          await loadLatestMessages("smooth");
        } else {
          applyMessage(response.message);
          requestScrollToLatest("smooth");
        }
      }
      void markChatChannelReadRequest(activeChannel.id).then((read) => applyChannel(read.channel)).catch(() => undefined);
    },
    [activeChannel, applyChannel, applyMessage, hasNewerMessages, loadLatestMessages, requestScrollToLatest],
  );

  const handleEditMessage = useCallback(
    async (body: string) => {
      if (!activeChannel || !editingMessage) return;
      const response = await updateChatMessageRequest({ channelId: activeChannel.id, messageId: editingMessage.id, body });
      applyMessage(response.message);
      setEditingMessage(null);
    },
    [activeChannel, applyMessage, editingMessage],
  );

  const handleDeleteMessage = useCallback(
    async (message: ChatMessage) => {
      if (!activeChannel) return;
      const response = await deleteChatMessageRequest({ channelId: activeChannel.id, messageId: message.id });
      applyMessage(response.message);
    },
    [activeChannel, applyMessage],
  );

  const handleMarkChannelUnread = useCallback(async () => {
    if (!activeChannel) return;
    const response = await setChatChannelUnreadRequest({ channelId: activeChannel.id });
    applyChannel(response.channel);
    const member = currentMembership(response.channel, currentUser?.id);
    setUnreadAnchor({
      channelId: response.channel.id,
      lastReadAt: member?.lastReadAt ?? null,
      manuallyUnread: true,
      mentionCount: response.channel.mentionCount,
      threadUnreadCount: response.channel.threadUnreadCount,
      unreadCount: response.channel.unreadCount,
    });
  }, [activeChannel, applyChannel, currentUser?.id]);

  const handleMarkMessageUnread = useCallback(async (message: ChatMessage) => {
    const response = await setChatChannelUnreadRequest({ channelId: message.channelId, messageId: message.id });
    applyChannel(response.channel);
    if (message.channelId === activeChannel?.id) {
      const member = currentMembership(response.channel, currentUser?.id);
      setUnreadAnchor({
        channelId: response.channel.id,
        lastReadAt: member?.lastReadAt ?? null,
        manuallyUnread: true,
        mentionCount: response.channel.mentionCount,
        threadUnreadCount: response.channel.threadUnreadCount,
        unreadCount: response.channel.unreadCount,
      });
    }
  }, [activeChannel?.id, applyChannel, currentUser?.id]);

  const handleCopyMessageLink = useCallback(async (message: ChatMessage) => {
    const url = `${window.location.origin}/chat/${encodeURIComponent(message.channelId)}?message=${encodeURIComponent(message.id)}`;
    try {
      await navigator.clipboard.writeText(url);
      notify("已复制消息链接");
    } catch {
      notify(url);
    }
  }, [notify]);

  const handleJumpToUnread = useCallback(() => {
    scrollChatFeedToUnread(messageScrollRef.current, { behavior: "smooth" });
  }, []);

  const handleLoadLatestMessages = useCallback(() => {
    if (hasNewerMessages) {
      void loadLatestMessages("smooth");
    } else {
      requestScrollToLatest("smooth");
    }
  }, [hasNewerMessages, loadLatestMessages, requestScrollToLatest]);

  const handleReaction = useCallback(
    async (message: ChatMessage, emojiName: string) => {
      if (!activeChannel) return;
      const currentReaction = message.reactions.find((reaction) => reaction.emojiName === emojiName);
      const response = await setChatReactionRequest({
        channelId: activeChannel.id,
        messageId: message.id,
        emojiName,
        reacting: !currentReaction?.reactedByCurrentUser,
      });
      applyMessage(response.message);
    },
    [activeChannel, applyMessage],
  );

  const handlePinMessage = useCallback(
    async (message: ChatMessage) => {
      const response = await setChatMessagePinRequest({
        channelId: message.channelId,
        messageId: message.id,
        pinned: !message.pinnedAt,
      });
      applyMessage(response.message);
      setCollectionResults((items) => {
        const updated = items.map((result) => (
          result.message.id === response.message.id ? { ...result, message: response.message } : result
        ));
        return activePanel === "pins" && message.pinnedAt ? updated.filter((result) => result.message.id !== message.id) : updated;
      });
    },
    [activePanel, applyMessage],
  );

  const handleSaveMessage = useCallback(
    async (message: ChatMessage) => {
      const response = await setChatMessageSavedRequest({
        channelId: message.channelId,
        messageId: message.id,
        saved: !message.savedByCurrentUser,
      });
      applyMessage(response.message);
      setCollectionResults((items) => {
        const updated = items.map((result) => (
          result.message.id === response.message.id ? { ...result, message: response.message } : result
        ));
        return activePanel === "saved" && message.savedByCurrentUser ? updated.filter((result) => result.message.id !== message.id) : updated;
      });
    },
    [activePanel, applyMessage],
  );

  const loadPinnedMessages = useCallback(async () => {
    if (!activeChannel) return;
    setActivePanel("pins");
    setCollectionLoading(true);
    try {
      const response = await getPinnedChatMessages(activeChannel.id);
      setCollectionResults(response.results);
    } catch (error) {
      notify(error instanceof Error ? error.message : "加载固定消息失败");
    } finally {
      setCollectionLoading(false);
    }
  }, [activeChannel, notify]);

  const loadSavedMessages = useCallback(async () => {
    setActivePanel("saved");
    setCollectionLoading(true);
    try {
      const response = await getSavedChatMessages();
      setCollectionResults(response.results);
    } catch (error) {
      notify(error instanceof Error ? error.message : "加载已保存消息失败");
    } finally {
      setCollectionLoading(false);
    }
  }, [notify]);

  const loadThreadSummaries = useCallback(async () => {
    setActivePanel("threads");
    setThreadSummariesLoading(true);
    try {
      const response = await getChatThreads();
      setThreadSummaries(response.threads);
    } catch (error) {
      notify(error instanceof Error ? error.message : "加载话题收件箱失败");
    } finally {
      setThreadSummariesLoading(false);
    }
  }, [notify]);

  const handleSearch = useCallback(
    async (input?: { query?: string; scope?: ChatSearchScope; type?: ChatSearchTypeFilter }) => {
      const value = input?.query ?? searchQuery;
      const scope = input?.scope ?? searchScope;
      const type = input?.type ?? searchType;
      if (!value.trim()) {
        setSearchResults([]);
        return;
      }
      setActivePanel("search");
      const response = await searchChat({
        q: value,
        channelId: scope === "current" ? activeChannel?.id : undefined,
        type: type === "all" ? undefined : type,
      });
      setSearchResults(response.results);
    },
    [activeChannel?.id, searchQuery, searchScope, searchType],
  );

  if (loading) {
    return (
      <div className="orf-chat-loading" role="status">
        <Loader2 className="h-6 w-6 animate-spin" />
        <span>正在打开聊天中心</span>
      </div>
    );
  }

  if (!bootstrap?.permissions.canRead) {
    return <div className="orf-chat-empty-page">当前账号没有聊天访问权限。</div>;
  }

  return (
    <div className={clsx("orf-chat-page", activePanel && "orf-chat-page-with-panel")}>
      <ChatSidebar
        activeChannelId={activeChannel?.id ?? null}
        channels={channels}
        currentUserId={currentUser?.id}
        draftChannelIds={draftChannelIds}
        onCreateChannel={() => setModal("channel")}
        onOpenChannel={(channelId) => navigate(`/chat/${encodeURIComponent(channelId)}`)}
        onOpenConversation={() => setModal("conversation")}
        query={channelQuery}
        setQuery={setChannelQuery}
        users={bootstrap.users}
      />
      <section className="orf-chat-main">
        {activeChannel ? (
          <>
            <ChatHeader
              canManage={canManageActiveChannel}
              channel={activeChannel}
              currentUserId={currentUser?.id}
              onArchive={async () => {
                await archiveChatChannelRequest(activeChannel.id);
                setChannels((items) => items.filter((channel) => channel.id !== activeChannel.id));
                navigate("/chat", { replace: true });
              }}
              onInfo={() => setActivePanel(activePanel === "info" ? null : "info")}
              onMarkUnread={() => void handleMarkChannelUnread()}
              onPins={() => void loadPinnedMessages()}
              onSaved={() => void loadSavedMessages()}
              onSearch={() => setActivePanel(activePanel === "search" ? null : "search")}
              onThreads={() => void loadThreadSummaries()}
              onToggleFavorite={async () => {
                const response = await updateChatChannelRequest(activeChannel.id, { favorite: !myMembership?.favorite });
                applyChannel(response.channel);
              }}
              onToggleMuted={async () => {
                const response = await updateChatChannelRequest(activeChannel.id, { muted: !myMembership?.muted });
                applyChannel(response.channel);
              }}
              usersById={usersById}
            />
            <ChatMessageFeed
              canPin={canManageActiveChannel}
              currentUserId={currentUser?.id}
              focusMessageId={focusMessageId}
              hasNewerMessages={hasNewerMessages}
              hasOlderMessages={hasOlderMessages}
              loadingMessages={messagesLoading}
              loadingOlderMessages={olderMessagesLoading}
              messages={messages}
              onAttachmentPreview={setAttachmentPreview}
              onCopyLink={handleCopyMessageLink}
              onDelete={handleDeleteMessage}
              onEdit={setEditingMessage}
              onJumpUnread={handleJumpToUnread}
              onLoadLatest={handleLoadLatestMessages}
              onLoadOlder={loadOlderMessages}
              onMarkUnread={handleMarkMessageUnread}
              onPin={handlePinMessage}
              onReaction={handleReaction}
              onSave={handleSaveMessage}
              onScroll={handleMessageScroll}
              onThread={openThread}
              pendingNewMessageCount={pendingNewMessageCount}
              scrollRef={messageScrollRef}
              unreadAnchor={unreadAnchor?.channelId === activeChannel.id ? unreadAnchor : null}
              usersById={usersById}
            />
            <ChatTypingLine typingByUser={typingByUser} />
            <ChatComposer
              channelId={activeChannel.id}
              disabled={!bootstrap.permissions.canWrite}
              mentionableUsers={activeMentionableUsers}
              onDraftStateChange={handleDraftStateChange}
              onSend={handleSendMessage}
              onTyping={handleTyping}
            />
          </>
        ) : (
          <div className="orf-chat-empty-channel">还没有可用频道。</div>
        )}
      </section>
      {activeChannel && activePanel && (
        <ChatRightPanel
          activePanel={activePanel}
          allUsers={bootstrap.users}
          canManage={canManageActiveChannel}
          channel={activeChannel}
          currentUserId={currentUser?.id}
          onDraftStateChange={handleDraftStateChange}
          onAddMembers={async (userIds) => {
            const response = await addChatChannelMembersRequest(activeChannel.id, userIds);
            applyChannel(response.channel);
          }}
          onClose={() => setActivePanel(null)}
          collectionLoading={collectionLoading}
          collectionResults={collectionResults}
          threadSummaries={threadSummaries}
          threadSummariesLoading={threadSummariesLoading}
          onOpenResult={(result) => {
            navigate(`/chat/${encodeURIComponent(result.channel.id)}?message=${encodeURIComponent(result.message.id)}`);
          }}
          onOpenThreadSummary={(summary) => {
            navigate(`/chat/${encodeURIComponent(summary.channel.id)}?message=${encodeURIComponent(summary.rootMessage.id)}`);
            setThreadSummaries((items) => items.map((item) => (
              item.rootMessage.id === summary.rootMessage.id ? { ...item, unreadCount: 0, lastViewedAt: new Date().toISOString() } : item
            )));
            void openThread(summary.rootMessage.id);
          }}
          onPin={handlePinMessage}
          onRemoveMember={async (userId) => {
            const response = await removeChatChannelMemberRequest(activeChannel.id, userId);
            if (response.channel) applyChannel(response.channel);
          }}
          onSearch={handleSearch}
          onSave={handleSaveMessage}
          onUpdateChannel={async (input) => {
            const response = await updateChatChannelRequest(activeChannel.id, input);
            applyChannel(response.channel);
          }}
          searchQuery={searchQuery}
          searchScope={searchScope}
          searchResults={searchResults}
          searchType={searchType}
          setSearchQuery={setSearchQuery}
          setSearchScope={setSearchScope}
          setSearchType={setSearchType}
          thread={thread}
          threadFocusMessageId={threadFocusMessageId}
          threadLoading={threadLoading}
          users={activeMentionableUsers}
          usersById={usersById}
          onSendThreadReply={handleSendMessage}
          onTyping={handleTyping}
          onToggleFollow={async (following) => {
            if (!thread) return;
            const response = await setChatThreadFollowRequest(thread.rootMessage.id, following);
            setThread(response.thread);
          }}
          onAttachmentPreview={setAttachmentPreview}
          onReaction={handleReaction}
          onEdit={setEditingMessage}
          onMarkUnread={handleMarkMessageUnread}
          onDelete={handleDeleteMessage}
          onCopyLink={handleCopyMessageLink}
        />
      )}
      {modal === "channel" && (
        <ChannelModal
          canCreatePublic={bootstrap.permissions.canCreatePublicChannel}
          currentUserId={currentUser?.id}
          onClose={() => setModal(null)}
          onCreate={async (input) => {
            const response = await createChatChannel(input);
            applyChannel(response.channel);
            navigate(`/chat/${encodeURIComponent(response.channel.id)}`);
            setModal(null);
          }}
          users={bootstrap.users}
        />
      )}
      {modal === "conversation" && (
        <ConversationModal
          currentUserId={currentUser?.id}
          onClose={() => setModal(null)}
          onOpen={async (userIds) => {
            const response = await openChatConversation(userIds);
            applyChannel(response.channel);
            navigate(`/chat/${encodeURIComponent(response.channel.id)}`);
            setModal(null);
          }}
          users={bootstrap.users}
        />
      )}
      {editingMessage && (
        <EditMessageDialog
          draft={draftFromStoredBody(editingMessage.body, usersById)}
          onClose={() => setEditingMessage(null)}
          onSave={(draft) => handleEditMessage(serializeDraft(draft))}
        />
      )}
      {attachmentPreview && <AttachmentPreview attachment={attachmentPreview} onClose={() => setAttachmentPreview(null)} />}
    </div>
  );
}
