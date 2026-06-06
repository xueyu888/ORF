import { clsx } from "clsx";
import {
  Archive,
  AtSign,
  Bell,
  BellOff,
  Bookmark,
  Bold,
  ChevronDown,
  Code,
  Download,
  Edit3,
  EyeOff,
  FileText,
  Hash,
  Image as ImageIcon,
  Info,
  Italic,
  Link as LinkIcon,
  Loader2,
  Lock,
  MessageSquare,
  Paperclip,
  Pin,
  Plus,
  Quote,
  Reply,
  Search,
  Send,
  Smile,
  Star,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { type ChangeEvent, type ClipboardEvent, type DragEvent, type KeyboardEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Avatar, Button, IconButton } from "../components/ui";
import {
  type ChatDraft,
  type UnreadAnchor,
  applyFeedMessage,
  buildUnreadAnchor,
  chatDraftStorageKey,
  chatMessagePageSize,
  createFeedSnapshot,
  currentMembership,
  draftFromStoredBody,
  emptyDraft,
  hasStoredDraftForChannel,
  isUnreadChannel,
  mentionLabel,
  mentionRangeFor,
  parseStoredDraft,
  prependOlderFeedMessages,
  reconcileMentions,
  rememberFeedScroll,
  replaceFeedMessages,
  serializeDraft,
  shouldFollowIncomingMessage,
  sortChannels,
  sortUnreadChannels,
  storedDraftChannelIds,
  upsertChannel,
  upsertMessage,
} from "../features/chat/chatModels";
import {
  type ChatAttachmentDraftItem,
  completeAttachmentDraftItem,
  createAttachmentDraftItem,
  emptyComposerHistory,
  failedDraftAttachmentCount,
  failAttachmentDraftItem,
  hasUploadingDraftAttachments,
  recallComposerHistory,
  recordSentComposerDraft,
  removeAttachmentDraftItem,
  uploadedDraftAttachments,
} from "../features/chat/chatComposerModel";
import {
  addChatChannelMembersRequest,
  archiveChatChannelRequest,
  createChatChannel,
  deleteChatMessageRequest,
  getChatBootstrap,
  getChatMentionableUsers,
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
  uploadChatAttachment,
} from "../state/apiClient";
import { useOrf } from "../state/OrfProvider";
import type { ChatAttachment, ChatBootstrap, ChatChannel, ChatChannelType, ChatMessage, ChatSearchResult, ChatThread, ChatThreadSummary, ChatUser } from "../types/orf";
import type { ChatRealtimeEvent } from "../types/realtime";

type ActivePanel = "thread" | "threads" | "info" | "search" | "pins" | "saved" | null;
type ChatSearchScope = "all" | "current";
type ChatSearchTypeFilter = ChatChannelType | "all";

type TypingState = {
  expiresAt: string;
  userId: string;
  userName: string;
};

const reactionEmojis = ["👍", "👀", "✅", "❤️", "🔥", "🎉", "😂", "😮", "🙏"];

function formatTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function formatDay(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { day: "2-digit", month: "2-digit", weekday: "short" }).format(new Date(value));
}

function formatFileSize(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function channelIcon(channel: ChatChannel) {
  if (channel.type === "public") return Hash;
  if (channel.type === "private") return Lock;
  return MessageSquare;
}

function renderTextFragments(body: string, usersById: Map<string, ChatUser>) {
  const nodes: ReactNode[] = [];
  const lines = body.split("\n");
  lines.forEach((line, lineIndex) => {
    const quote = line.startsWith("> ");
    nodes.push(
      quote ? (
        <blockquote className="orf-chat-markdown-quote" key={`line:${lineIndex}`}>
          {renderInlineFragments(line.slice(2), usersById, lineIndex)}
        </blockquote>
      ) : (
        <span key={`line:${lineIndex}`}>{renderInlineFragments(line, usersById, lineIndex)}</span>
      ),
    );
    if (lineIndex < lines.length - 1) nodes.push(<br key={`br:${lineIndex}`} />);
  });
  return nodes;
}

function renderInlineFragments(body: string, usersById: Map<string, ChatUser>, lineIndex = 0) {
  const nodes: ReactNode[] = [];
  const pattern = /@\[([^\]\n]*)\]\(orf-user:([^) \n]+)\)|(https?:\/\/[^\s<]+)|`([^`\n]+)`|\*\*([^*\n]+)\*\*|_([^_\n]+)_/g;
  let index = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(body)) !== null) {
    if (match.index > index) nodes.push(<span key={`text:${lineIndex}:${index}`}>{body.slice(index, match.index)}</span>);
    if (match[2]) {
      const userId = decodeURIComponent(match[2]);
      const user = usersById.get(userId);
      nodes.push(
        <span className="orf-chat-mention-token" key={`mention:${lineIndex}:${match.index}`} title={user?.email || user?.name || match[1]}>
          @{user?.name ?? match[1]}
        </span>,
      );
    } else if (match[3]) {
      nodes.push(
        <a href={match[3]} key={`link:${lineIndex}:${match.index}`} target="_blank" rel="noreferrer">
          {match[3]}
        </a>,
      );
    } else if (match[4]) {
      nodes.push(<code key={`code:${lineIndex}:${match.index}`}>{match[4]}</code>);
    } else if (match[5]) {
      nodes.push(<strong key={`bold:${lineIndex}:${match.index}`}>{match[5]}</strong>);
    } else if (match[6]) {
      nodes.push(<em key={`italic:${lineIndex}:${match.index}`}>{match[6]}</em>);
    }
    index = pattern.lastIndex;
  }
  if (index < body.length) nodes.push(<span key={`text:${lineIndex}:${index}`}>{body.slice(index)}</span>);
  return nodes;
}

function parseRealtimeEvent(raw: string): ChatRealtimeEvent | null {
  try {
    const event = JSON.parse(raw) as ChatRealtimeEvent;
    return event.kind === "chat.event" ? event : null;
  } catch {
    return null;
  }
}

function isChatUserOnline(user: ChatUser | undefined, currentUserId?: string) {
  if (!user) return false;
  if (user.id === currentUserId) return true;
  const lastOnlineAt = user.lastOnlineAt ? Date.parse(user.lastOnlineAt) : 0;
  return Boolean(lastOnlineAt && Date.now() - lastOnlineAt < 5 * 60 * 1000);
}

function formatPresence(user: ChatUser | undefined, currentUserId?: string) {
  if (!user) return "未知";
  if (isChatUserOnline(user, currentUserId)) return "在线";
  const lastOnlineAt = user.lastOnlineAt ? Date.parse(user.lastOnlineAt) : 0;
  if (!lastOnlineAt) return "离线";
  const minutes = Math.max(1, Math.round((Date.now() - lastOnlineAt) / 60000));
  if (minutes < 60) return `${minutes} 分钟前在线`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} 小时前在线`;
  return "离线";
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
  const [threadLoading, setThreadLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [olderMessagesLoading, setOlderMessagesLoading] = useState(false);
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
  const [imagePreview, setImagePreview] = useState<ChatAttachment | null>(null);
  const [pendingNewMessageCount, setPendingNewMessageCount] = useState(0);
  const [unreadAnchor, setUnreadAnchor] = useState<UnreadAnchor | null>(null);
  const lastTypingSentAtRef = useRef(0);
  const activeChannelIdRef = useRef<string | null>(null);
  const feedCacheRef = useRef(new Map<string, ReturnType<typeof createFeedSnapshot>>());
  const messageScrollRef = useRef<HTMLDivElement | null>(null);
  const pendingLatestScrollRef = useRef<ScrollBehavior | null>(null);
  const activeChannel = routeChannelId ? channels.find((channel) => channel.id === routeChannelId) ?? null : channels[0] ?? null;
  activeChannelIdRef.current = activeChannel?.id ?? null;
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
    const element = messageScrollRef.current;
    if (!element) return true;
    return element.scrollHeight - element.scrollTop - element.clientHeight < 160;
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
    setThreadSummaries((items) => items.map((summary) => (
      summary.rootMessage.id === message.id ? { ...summary, rootMessage: message } : summary
    )));
    setSearchResults((items) => items.map((result) => (result.message.id === message.id ? { ...result, message } : result)));
    setCollectionResults((items) => items.map((result) => (result.message.id === message.id ? { ...result, message } : result)));
  }, []);

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
    setUnreadAnchor(anchor);
    setPendingNewMessageCount(0);
    setMessages(cachedFeed?.messages ?? []);
    setHasOlderMessages(cachedFeed?.hasOlderMessages ?? false);
    setMessagesLoading(!cachedFeed);
    if (cachedFeed) restoreFeedScroll(cachedFeed.scrollTop);
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
          setHasOlderMessages(snapshot.hasOlderMessages);
          if (!cachedFeed && !anchor && !new URLSearchParams(window.location.search).get("message")) {
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
    if (!requestedMessageId || !messages.some((message) => message.id === requestedMessageId || message.rootMessageId === requestedMessageId)) return;
    window.setTimeout(() => {
      document.getElementById(`chat-message-${requestedMessageId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
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
      const element = messageScrollRef.current;
      if (!element) return;
      element.scrollTo({ top: element.scrollHeight, behavior });
    });
  }, [activeChannel?.id, messages, messagesLoading]);

  useEffect(() => {
    if (!activeChannel || typeof EventSource === "undefined") return undefined;
    const source = new EventSource("/api/events", { withCredentials: true });
    const handleChatEvent = (event: MessageEvent<string>) => {
      const payload = parseRealtimeEvent(event.data);
      if (!payload) return;
      if (payload.channel) applyChannel(payload.channel);
      if (payload.eventType === "channel.archived") {
        setChannels((items) => items.filter((channel) => channel.id !== payload.channelId));
        if (payload.channelId === activeChannel.id) navigate("/chat", { replace: true });
      }
      if (payload.eventType === "member.changed" && payload.channel) {
        applyChannel(payload.channel);
      }
      if (payload.message && payload.channelId === activeChannel.id) {
        const shouldFollowLatest = shouldFollowIncomingMessage(payload.message, currentUser?.id, isMessageScrollNearLatest());
        applyMessage(payload.message);
        if (shouldFollowLatest) {
          requestScrollToLatest("smooth");
        } else if (!payload.message.rootMessageId) {
          setPendingNewMessageCount((count) => count + 1);
        }
      }
      if (payload.eventType === "typing" && payload.channelId === activeChannel.id && payload.typing && payload.typing.userId !== currentUser?.id) {
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
  }, [activeChannel, applyChannel, applyMessage, currentUser?.id, isMessageScrollNearLatest, navigate, requestScrollToLatest]);

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
    async (rootMessageId: string) => {
      setActivePanel("thread");
      setThreadLoading(true);
      try {
        const response = await getChatThread(rootMessageId);
        setThread(response.thread);
      } catch (error) {
        setThread(null);
        notify(error instanceof Error ? error.message : "加载线程失败");
      } finally {
        setThreadLoading(false);
      }
    },
    [notify],
  );

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
        applyMessage(response.message);
        requestScrollToLatest("smooth");
      }
      void markChatChannelReadRequest(activeChannel.id).then((read) => applyChannel(read.channel)).catch(() => undefined);
    },
    [activeChannel, applyChannel, applyMessage, requestScrollToLatest],
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
    const targetMessageId = message.rootMessageId ?? message.id;
    const url = `${window.location.origin}/chat/${encodeURIComponent(message.channelId)}?message=${encodeURIComponent(targetMessageId)}`;
    try {
      await navigator.clipboard.writeText(url);
      notify("已复制消息链接");
    } catch {
      notify(url);
    }
  }, [notify]);

  const handleJumpToUnread = useCallback(() => {
    const messageScroll = messageScrollRef.current;
    const target =
      messageScroll?.querySelector<HTMLElement>("#orf-chat-unread-divider") ??
      messageScroll?.querySelector<HTMLElement>("[data-chat-unread-message='true']");
    if (!messageScroll || !target) return;
    const scrollRect = messageScroll.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const stickyButtonOffset = 48;
    const nextTop = messageScroll.scrollTop + targetRect.top - scrollRect.top - stickyButtonOffset;
    messageScroll.scrollTo({ top: Math.max(0, nextTop), behavior: "smooth" });
  }, []);

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
            <div className="orf-chat-message-scroll" ref={messageScrollRef} onScroll={handleMessageScroll}>
              {messagesLoading && messages.length > 0 && (
                <div className="orf-chat-message-loading-chip" role="status">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>同步消息</span>
                </div>
              )}
              {messagesLoading && messages.length === 0 ? (
                <div className="orf-chat-message-loading"><Loader2 className="h-5 w-5 animate-spin" /> 加载消息</div>
              ) : (
                <MessageList
                  currentUserId={currentUser?.id}
                  focusMessageId={focusMessageId}
                  hasOlderMessages={hasOlderMessages}
                  loadingOlderMessages={olderMessagesLoading}
                  messages={messages}
                  onDelete={handleDeleteMessage}
                  onCopyLink={handleCopyMessageLink}
                  onEdit={setEditingMessage}
                  onImage={setImagePreview}
                  onJumpUnread={handleJumpToUnread}
                  onLoadOlder={loadOlderMessages}
                  onMarkUnread={handleMarkMessageUnread}
                  onPin={handlePinMessage}
                  onReaction={handleReaction}
                  onSave={handleSaveMessage}
                  onThread={openThread}
                  usersById={usersById}
                  unreadAnchor={unreadAnchor?.channelId === activeChannel.id ? unreadAnchor : null}
                  canPin={canManageActiveChannel}
                />
              )}
              {pendingNewMessageCount > 0 && (
                <button className="orf-chat-scroll-latest" type="button" onClick={() => requestScrollToLatest("smooth")}>
                  <ChevronDown className="h-4 w-4" />
                  {pendingNewMessageCount} 条新消息
                </button>
              )}
            </div>
            <TypingLine typingByUser={typingByUser} />
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
            navigate(`/chat/${encodeURIComponent(result.channel.id)}?message=${encodeURIComponent(result.message.rootMessageId ?? result.message.id)}`);
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
          onImage={setImagePreview}
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
      {imagePreview && <ImagePreview attachment={imagePreview} onClose={() => setImagePreview(null)} />}
    </div>
  );
}

function ChatSidebar({
  activeChannelId,
  channels,
  currentUserId,
  draftChannelIds,
  onCreateChannel,
  onOpenChannel,
  onOpenConversation,
  query,
  setQuery,
  users,
}: {
  activeChannelId: string | null;
  channels: ChatChannel[];
  currentUserId?: string;
  draftChannelIds: Set<string>;
  onCreateChannel: () => void;
  onOpenChannel: (channelId: string) => void;
  onOpenConversation: () => void;
  query: string;
  setQuery: (value: string) => void;
  users: ChatUser[];
}) {
  const filteredChannels = channels.filter((channel) => channel.displayName.toLowerCase().includes(query.trim().toLowerCase()));
  const unreadChannels = sortUnreadChannels(filteredChannels.filter((channel) => isUnreadChannel(channel, currentUserId)));
  const unreadChannelIds = new Set(unreadChannels.map((channel) => channel.id));
  const regularChannels = unreadChannelIds.size > 0 ? filteredChannels.filter((channel) => !unreadChannelIds.has(channel.id)) : filteredChannels;
  const favorites = regularChannels.filter((channel) => currentMembership(channel, currentUserId)?.favorite);
  const publicChannels = regularChannels.filter((channel) => channel.type === "public");
  const privateChannels = regularChannels.filter((channel) => channel.type === "private");
  const conversations = regularChannels.filter((channel) => channel.type === "direct" || channel.type === "group");

  return (
    <aside className="orf-chat-sidebar">
      <div className="orf-chat-sidebar-header">
        <div>
          <h2>聊天</h2>
          <span>{users.length} 位成员</span>
        </div>
        <IconButton icon={Plus} label="新建频道" onClick={onCreateChannel} />
      </div>
      <label className="orf-chat-search-box">
        <Search className="h-4 w-4" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="查找频道或私信" />
      </label>
      <button type="button" className="orf-chat-new-conversation" onClick={onOpenConversation}>
        <MessageSquare className="h-4 w-4" />
        新建私聊/群聊
      </button>
      <div className="orf-chat-channel-groups">
        <ChannelGroup title="未读" channels={unreadChannels} activeChannelId={activeChannelId} currentUserId={currentUserId} draftChannelIds={draftChannelIds} onOpenChannel={onOpenChannel} />
        <ChannelGroup title="收藏" channels={favorites} activeChannelId={activeChannelId} currentUserId={currentUserId} draftChannelIds={draftChannelIds} onOpenChannel={onOpenChannel} />
        <ChannelGroup title="公开频道" channels={publicChannels} activeChannelId={activeChannelId} currentUserId={currentUserId} draftChannelIds={draftChannelIds} onOpenChannel={onOpenChannel} />
        <ChannelGroup title="私有频道" channels={privateChannels} activeChannelId={activeChannelId} currentUserId={currentUserId} draftChannelIds={draftChannelIds} onOpenChannel={onOpenChannel} />
        <ChannelGroup title="私信" channels={conversations} activeChannelId={activeChannelId} currentUserId={currentUserId} draftChannelIds={draftChannelIds} onOpenChannel={onOpenChannel} />
      </div>
    </aside>
  );
}

function ChannelGroup({
  activeChannelId,
  channels,
  currentUserId,
  draftChannelIds,
  onOpenChannel,
  title,
}: {
  activeChannelId: string | null;
  channels: ChatChannel[];
  currentUserId?: string;
  draftChannelIds: Set<string>;
  onOpenChannel: (channelId: string) => void;
  title: string;
}) {
  if (channels.length === 0) return null;
  return (
    <section className="orf-chat-channel-group">
      <div className="orf-chat-channel-group-title">
        <ChevronDown className="h-3.5 w-3.5" />
        {title}
      </div>
      {channels.map((channel) => {
        const Icon = channelIcon(channel);
        const membership = currentMembership(channel, currentUserId);
        const unread = channel.unreadCount + channel.threadUnreadCount;
        const hasDraft = draftChannelIds.has(channel.id);
        return (
          <button
            type="button"
            className={clsx(
              "orf-chat-channel-item",
              channel.id === activeChannelId && "orf-chat-channel-item-active",
              membership?.muted && "orf-chat-channel-item-muted",
            )}
            key={channel.id}
            onClick={() => onOpenChannel(channel.id)}
          >
            <Icon className="h-4 w-4" />
            <span className="truncate">{channel.displayName}</span>
            {channel.mentionCount > 0 ? <strong>@{channel.mentionCount}</strong> : unread > 0 ? <b>{unread}</b> : null}
            {hasDraft && unread === 0 && channel.mentionCount === 0 ? <em>草稿</em> : null}
          </button>
        );
      })}
    </section>
  );
}

function ChatHeader({
  canManage,
  channel,
  currentUserId,
  onArchive,
  onInfo,
  onMarkUnread,
  onPins,
  onSaved,
  onSearch,
  onThreads,
  onToggleFavorite,
  onToggleMuted,
  usersById,
}: {
  canManage: boolean;
  channel: ChatChannel;
  currentUserId?: string;
  onArchive: () => void;
  onInfo: () => void;
  onMarkUnread: () => void;
  onPins: () => void;
  onSaved: () => void;
  onSearch: () => void;
  onThreads: () => void;
  onToggleFavorite: () => void;
  onToggleMuted: () => void;
  usersById: Map<string, ChatUser>;
}) {
  const Icon = channelIcon(channel);
  const membership = currentMembership(channel, currentUserId);
  const memberNames = channel.members
    .slice(0, 4)
    .map((member) => usersById.get(member.userId)?.name)
    .filter(Boolean)
    .join(", ");

  return (
    <header className="orf-chat-header">
      <button type="button" className="orf-chat-header-title" onClick={onInfo}>
        <Icon className="h-5 w-5" />
        <span>{channel.displayName}</span>
      </button>
      <div className="orf-chat-header-meta">
        <Users className="h-4 w-4" />
        <span>{channel.memberCount}</span>
        {memberNames && <span className="truncate">{memberNames}</span>}
      </div>
      <div className="orf-chat-header-actions">
        <IconButton className={membership?.favorite ? "orf-chat-starred" : ""} icon={Star} label="收藏频道" onClick={onToggleFavorite} />
        <IconButton icon={EyeOff} label="标记未读" onClick={onMarkUnread} />
        <IconButton
          className={membership?.muted ? "orf-chat-muted" : ""}
          icon={membership?.muted ? BellOff : Bell}
          label={membership?.muted ? "取消静音" : "静音频道"}
          onClick={onToggleMuted}
        />
        <IconButton icon={Pin} label="固定消息" onClick={onPins} />
        <IconButton icon={Bookmark} label="已保存消息" onClick={onSaved} />
        <IconButton icon={Reply} label="话题收件箱" onClick={onThreads} />
        <IconButton icon={Search} label="搜索消息" onClick={onSearch} />
        <IconButton icon={Info} label="频道信息" onClick={onInfo} />
        {canManage && channel.type !== "direct" && channel.type !== "group" && channel.name !== "orf-town-square" && (
          <IconButton icon={Archive} label="归档频道" onClick={onArchive} />
        )}
      </div>
    </header>
  );
}

function MessageList({
  canPin,
  currentUserId,
  focusMessageId,
  hasOlderMessages,
  loadingOlderMessages,
  messages,
  onCopyLink,
  onDelete,
  onEdit,
  onImage,
  onJumpUnread,
  onLoadOlder,
  onMarkUnread,
  onPin,
  onReaction,
  onSave,
  onThread,
  usersById,
  unreadAnchor,
}: {
  canPin: boolean;
  currentUserId?: string;
  focusMessageId: string | null;
  hasOlderMessages: boolean;
  loadingOlderMessages: boolean;
  messages: ChatMessage[];
  onCopyLink: (message: ChatMessage) => void;
  onDelete: (message: ChatMessage) => void;
  onEdit: (message: ChatMessage) => void;
  onImage: (attachment: ChatAttachment) => void;
  onJumpUnread: () => void;
  onLoadOlder: () => void;
  onMarkUnread: (message: ChatMessage) => void;
  onPin: (message: ChatMessage) => void;
  onReaction: (message: ChatMessage, emojiName: string) => void;
  onSave: (message: ChatMessage) => void;
  onThread: (rootMessageId: string) => void;
  usersById: Map<string, ChatUser>;
  unreadAnchor: UnreadAnchor | null;
}) {
  if (messages.length === 0) {
    return <div className="orf-chat-message-empty">这里还没有消息。</div>;
  }
  let lastDay = "";
  const firstUnreadIndex = unreadAnchor
    ? messages.findIndex((message) => {
        if (message.deletedAt) return false;
        if (unreadAnchor.lastReadAt && message.createdAt <= unreadAnchor.lastReadAt) return false;
        return message.authorUserId !== currentUserId || unreadAnchor.manuallyUnread;
      })
    : -1;
  const unreadDividerIndex = firstUnreadIndex >= 0 ? firstUnreadIndex : unreadAnchor?.manuallyUnread ? 0 : -1;
  const unreadMessageId = unreadDividerIndex >= 0 ? messages[unreadDividerIndex]?.id : null;
  return (
    <div className="orf-chat-message-list">
      {unreadMessageId && (
        <button className="orf-chat-unread-jump" type="button" onClick={onJumpUnread}>
          <ChevronDown className="h-4 w-4" />
          跳到未读
        </button>
      )}
      {hasOlderMessages && (
        <button className="orf-chat-load-older" disabled={loadingOlderMessages} type="button" onClick={onLoadOlder}>
          {loadingOlderMessages ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronDown className="h-4 w-4" />}
          加载更早消息
        </button>
      )}
      {messages.map((message, index) => {
        const day = formatDay(message.createdAt);
        const showDay = day !== lastDay;
        lastDay = day;
        return (
          <div key={message.id}>
            {showDay && <div className="orf-chat-day-divider"><span>{day}</span></div>}
            {unreadDividerIndex === index && (
              <div className="orf-chat-unread-divider" id="orf-chat-unread-divider">
                <span>新消息</span>
              </div>
            )}
            <MessageItem
              canPin={canPin}
              currentUserId={currentUserId}
              firstUnread={unreadMessageId === message.id}
              focused={focusMessageId === message.id}
              message={message}
              onCopyLink={onCopyLink}
              onDelete={onDelete}
              onEdit={onEdit}
              onImage={onImage}
              onMarkUnread={onMarkUnread}
              onPin={onPin}
              onReaction={onReaction}
              onSave={onSave}
              onThread={onThread}
              usersById={usersById}
            />
          </div>
        );
      })}
    </div>
  );
}

function MessageItem({
  canPin,
  currentUserId,
  firstUnread,
  focused,
  message,
  onCopyLink,
  onDelete,
  onEdit,
  onImage,
  onMarkUnread,
  onPin,
  onReaction,
  onSave,
  onThread,
  usersById,
}: {
  canPin?: boolean;
  currentUserId?: string;
  firstUnread?: boolean;
  focused?: boolean;
  message: ChatMessage;
  onCopyLink: (message: ChatMessage) => void;
  onDelete: (message: ChatMessage) => void;
  onEdit: (message: ChatMessage) => void;
  onImage: (attachment: ChatAttachment) => void;
  onMarkUnread?: (message: ChatMessage) => void;
  onPin?: (message: ChatMessage) => void;
  onReaction: (message: ChatMessage, emojiName: string) => void;
  onSave?: (message: ChatMessage) => void;
  onThread: (rootMessageId: string) => void;
  usersById: Map<string, ChatUser>;
}) {
  const [emojiOpen, setEmojiOpen] = useState(false);
  const canMutate = message.authorUserId === currentUserId && !message.deletedAt;

  return (
    <article
      className={clsx("orf-chat-message", message.pinnedAt && "orf-chat-message-pinned", focused && "orf-chat-message-focused")}
      data-chat-unread-message={firstUnread ? "true" : undefined}
      id={`chat-message-${message.id}`}
    >
      <Avatar avatarUrl={message.authorAvatarUrl} name={message.authorName} size="md" />
      <div className="orf-chat-message-body">
        <div className="orf-chat-message-meta">
          <strong>{message.authorName}</strong>
          <span>{formatTime(message.createdAt)}</span>
          {message.pinnedAt && (
            <span className="orf-chat-message-pin-label">
              <Pin className="h-3 w-3" />
              已固定
            </span>
          )}
          {message.editedAt && !message.deletedAt && <em>已编辑</em>}
        </div>
        {message.deletedAt ? (
          <div className="orf-chat-message-deleted">消息已删除</div>
        ) : (
          <>
            <div className="orf-chat-message-text">{renderTextFragments(message.body, usersById)}</div>
            <AttachmentGrid attachments={message.attachments} onImage={onImage} />
            <div className="orf-chat-reaction-row">
              {message.reactions.map((reaction) => (
                <button
                  type="button"
                  className={clsx("orf-chat-reaction", reaction.reactedByCurrentUser && "orf-chat-reaction-active")}
                  key={reaction.emojiName}
                  onClick={() => onReaction(message, reaction.emojiName)}
                >
                  {reaction.emojiName} <span>{reaction.count}</span>
                </button>
              ))}
              <div className="orf-chat-emoji-anchor">
                <button type="button" className="orf-chat-mini-action" onClick={() => setEmojiOpen((open) => !open)} title="添加反应">
                  <Smile className="h-3.5 w-3.5" />
                </button>
                {emojiOpen && (
                  <div className="orf-chat-emoji-popover">
                    {reactionEmojis.map((emoji) => (
                      <button type="button" key={emoji} onClick={() => { setEmojiOpen(false); onReaction(message, emoji); }}>
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button type="button" className="orf-chat-thread-link" onClick={() => onThread(message.id)}>
                <Reply className="h-3.5 w-3.5" />
                {message.replyCount > 0 ? `${message.replyCount} 条回复` : "回复"}
              </button>
            </div>
          </>
        )}
      </div>
      {!message.deletedAt && (
        <div className="orf-chat-message-actions">
          {onSave && (
            <IconButton
              className={message.savedByCurrentUser ? "orf-chat-message-action-active" : ""}
              icon={Bookmark}
              label={message.savedByCurrentUser ? "取消保存" : "保存消息"}
              onClick={() => onSave(message)}
            />
          )}
          {canPin && onPin && (
            <IconButton
              className={message.pinnedAt ? "orf-chat-message-action-active" : ""}
              icon={Pin}
              label={message.pinnedAt ? "取消固定" : "固定消息"}
              onClick={() => onPin(message)}
            />
          )}
          {onMarkUnread && <IconButton icon={EyeOff} label="从这里标记未读" onClick={() => onMarkUnread(message)} />}
          <IconButton icon={LinkIcon} label="复制消息链接" onClick={() => onCopyLink(message)} />
          {canMutate && <IconButton icon={Edit3} label="编辑消息" onClick={() => onEdit(message)} />}
          {canMutate && <IconButton icon={Trash2} label="删除消息" onClick={() => onDelete(message)} />}
        </div>
      )}
    </article>
  );
}

function AttachmentGrid({ attachments, onImage }: { attachments: ChatAttachment[]; onImage: (attachment: ChatAttachment) => void }) {
  if (attachments.length === 0) return null;
  return (
    <div className="orf-chat-attachments">
      {attachments.map((attachment) => {
        const isImage = attachment.mimeType.startsWith("image/");
        return isImage ? (
          <button type="button" className="orf-chat-image-attachment" key={attachment.id} onClick={() => onImage(attachment)}>
            <img src={attachment.contentUrl} alt={attachment.fileName} loading="lazy" />
            <span>{attachment.fileName}</span>
          </button>
        ) : (
          <a className="orf-chat-file-attachment" href={attachment.contentUrl} key={attachment.id} download={attachment.fileName}>
            <FileText className="h-5 w-5" />
            <span>{attachment.fileName}</span>
            <small>{formatFileSize(attachment.fileSize)}</small>
            <Download className="h-4 w-4" />
          </a>
        );
      })}
    </div>
  );
}

function ChatComposer({
  channelId,
  disabled,
  mentionableUsers,
  onDraftStateChange,
  onSend,
  onTyping,
  rootMessageId,
  parentMessageId,
}: {
  channelId: string;
  disabled?: boolean;
  mentionableUsers: ChatUser[];
  onDraftStateChange?: (channelId: string, hasDraft: boolean) => void;
  onSend: (draft: ChatDraft, attachments: ChatAttachment[], rootMessageId?: string | null, parentMessageId?: string | null) => Promise<void>;
  onTyping?: () => void;
  parentMessageId?: string | null;
  rootMessageId?: string | null;
}) {
  const [draft, setDraft] = useState<ChatDraft>(emptyDraft);
  const [attachmentItems, setAttachmentItems] = useState<ChatAttachmentDraftItem[]>([]);
  const [mentionRange, setMentionRange] = useState<ReturnType<typeof mentionRangeFor>>(null);
  const [selectedMention, setSelectedMention] = useState(0);
  const [draggingFiles, setDraggingFiles] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState(emptyComposerHistory);
  const uploading = hasUploadingDraftAttachments(attachmentItems);
  const failedUploads = failedDraftAttachmentCount(attachmentItems);
  const draftStorageKey = useMemo(() => chatDraftStorageKey(channelId, rootMessageId), [channelId, rootMessageId]);
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const activeDraftStorageKeyRef = useRef(draftStorageKey);
  const mentionUsers = useMemo(() => {
    if (!mentionRange) return [];
    const query = mentionRange.query.toLowerCase();
    return mentionableUsers
      .filter((user) => user.status === "active")
      .filter((user) => user.name.toLowerCase().includes(query) || user.email.toLowerCase().includes(query))
      .slice(0, 8);
  }, [mentionRange, mentionableUsers]);

  useEffect(() => {
    activeDraftStorageKeyRef.current = draftStorageKey;
    setDraft(parseStoredDraft(window.localStorage.getItem(draftStorageKey)));
    setAttachmentItems([]);
    setError("");
    setMentionRange(null);
    setSelectedMention(0);
    setDraggingFiles(false);
    setHistory(emptyComposerHistory);
  }, [draftStorageKey]);

  useEffect(() => {
    if (activeDraftStorageKeyRef.current !== draftStorageKey) return;
    if (draft.text.trim()) {
      window.localStorage.setItem(draftStorageKey, JSON.stringify(draft));
      onDraftStateChange?.(channelId, true);
    } else {
      window.localStorage.removeItem(draftStorageKey);
      onDraftStateChange?.(channelId, hasStoredDraftForChannel(channelId));
    }
  }, [channelId, draft, draftStorageKey, onDraftStateChange]);

  const setText = (text: string, cursor: number) => {
    const mentions = reconcileMentions(draft.text, text, draft.mentions);
    setDraft({ text, mentions });
    setMentionRange(mentionRangeFor(text, cursor, mentions));
    setHistory((item) => item.cursorIndex === null ? item : { ...item, cursorIndex: null, restoreDraft: null });
    onTyping?.();
  };

  const insertMarkdown = (before: string, after = before) => {
    const textarea = textAreaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const nextText = `${draft.text.slice(0, start)}${before}${draft.text.slice(start, end)}${after}${draft.text.slice(end)}`;
    setDraft({ text: nextText, mentions: reconcileMentions(draft.text, nextText, draft.mentions) });
    window.setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + before.length, end + before.length);
    }, 0);
  };

  const insertMention = (user: ChatUser) => {
    if (!mentionRange) return;
    const label = mentionLabel(user.name);
    const replacement = `@${label}`;
    const nextText = `${draft.text.slice(0, mentionRange.start)}${replacement} ${draft.text.slice(mentionRange.end)}`;
    const nextMention = {
      start: mentionRange.start,
      end: mentionRange.start + replacement.length,
      label,
      userId: user.id,
    };
    const mentions = [
      ...draft.mentions.filter((mention) => mention.end <= mentionRange.start || mention.start >= mentionRange.end),
      nextMention,
    ].sort((left, right) => left.start - right.start);
    setDraft({ text: nextText, mentions });
    setMentionRange(null);
    window.setTimeout(() => {
      const cursor = nextMention.end + 1;
      textAreaRef.current?.focus();
      textAreaRef.current?.setSelectionRange(cursor, cursor);
    }, 0);
  };

  const uploadFiles = async (files: File[]) => {
    if (disabled) return;
    if (files.length === 0) return;
    setError("");
    const uploads = files.slice(0, 10).map((file) => ({ file, item: createAttachmentDraftItem(file) }));
    setAttachmentItems((items) => [...items, ...uploads.map((upload) => upload.item)]);
    for (const upload of uploads) {
      try {
        const response = await uploadChatAttachment({ channelId, file: upload.file });
        setAttachmentItems((items) => completeAttachmentDraftItem(items, upload.item.clientId, response.attachment));
      } catch (uploadError) {
        const message = uploadError instanceof Error ? uploadError.message : "上传附件失败";
        setAttachmentItems((items) => failAttachmentDraftItem(items, upload.item.clientId, message));
        setError(message);
      }
    }
  };

  const handleFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    await uploadFiles(Array.from(event.target.files ?? []));
    event.target.value = "";
  };

  const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(event.clipboardData.files ?? []).filter((file) => file.size > 0);
    if (files.length === 0) return;
    event.preventDefault();
    void uploadFiles(files);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (Array.from(event.dataTransfer.types).includes("Files")) {
      event.preventDefault();
      setDraggingFiles(true);
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    if (disabled) return;
    const files = Array.from(event.dataTransfer.files ?? []).filter((file) => file.size > 0);
    if (files.length === 0) return;
    event.preventDefault();
    setDraggingFiles(false);
    void uploadFiles(files);
  };

  const submit = async () => {
    if (disabled || uploading) return;
    const uploadedAttachments = uploadedDraftAttachments(attachmentItems);
    if (!draft.text.trim() && uploadedAttachments.length === 0) return;
    if (failedUploads > 0) {
      setError("请移除上传失败的附件后发送");
      return;
    }
    setError("");
    try {
      await onSend(draft, uploadedAttachments, rootMessageId, parentMessageId);
      setHistory((item) => recordSentComposerDraft(item, draft));
      setDraft(emptyDraft);
      setAttachmentItems([]);
      setMentionRange(null);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "发送消息失败");
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionRange && mentionUsers.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedMention((index) => (index + 1) % mentionUsers.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedMention((index) => (index - 1 + mentionUsers.length) % mentionUsers.length);
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        insertMention(mentionUsers[selectedMention] ?? mentionUsers[0]);
        return;
      }
      if (event.key === "Escape") {
        setMentionRange(null);
        return;
      }
    }
    if (event.key === "ArrowUp" && !event.shiftKey) {
      const textarea = textAreaRef.current;
      const canRecall = textarea?.selectionStart === 0 && (history.cursorIndex !== null || !draft.text.trim());
      if (canRecall) {
        const recalled = recallComposerHistory(history, draft, "older");
        if (recalled) {
          event.preventDefault();
          setDraft(recalled.draft);
          setHistory(recalled.history);
          setMentionRange(null);
          window.setTimeout(() => {
            const next = textAreaRef.current;
            if (!next) return;
            next.focus();
            next.setSelectionRange(0, 0);
          }, 0);
          return;
        }
      }
    }
    if (event.key === "ArrowDown" && !event.shiftKey && history.cursorIndex !== null) {
      const textarea = textAreaRef.current;
      const canRecall = textarea ? textarea.selectionStart === textarea.value.length : true;
      if (canRecall) {
        const recalled = recallComposerHistory(history, draft, "newer");
        if (recalled) {
          event.preventDefault();
          setDraft(recalled.draft);
          setHistory(recalled.history);
          setMentionRange(null);
          window.setTimeout(() => {
            const next = textAreaRef.current;
            if (!next) return;
            next.focus();
            const cursor = next.value.length;
            next.setSelectionRange(cursor, cursor);
          }, 0);
          return;
        }
      }
    }
    if (event.key === "Enter" && !event.shiftKey && !event.altKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void submit();
    }
  };

  return (
    <div
      className={clsx("orf-chat-composer", draggingFiles && "orf-chat-composer-dragging")}
      onDragLeave={() => setDraggingFiles(false)}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {attachmentItems.length > 0 && (
        <div className="orf-chat-pending-attachments">
          {attachmentItems.map((item) => (
            <span className={item.status === "failed" ? "orf-chat-pending-attachment-failed" : ""} key={item.clientId}>
              {item.status === "uploading" ? <Loader2 className="h-4 w-4 animate-spin" /> : item.mimeType.startsWith("image/") ? <ImageIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
              {item.fileName}
              {item.status === "failed" && <small>{item.error}</small>}
              {item.status === "uploading" && <small>上传中</small>}
              <button type="button" onClick={() => setAttachmentItems((items) => removeAttachmentDraftItem(items, item.clientId))}>
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}
      {error && <div className="orf-chat-composer-error">{error}</div>}
      <div className="orf-chat-composer-box">
        <textarea
          disabled={disabled}
          onChange={(event) => setText(event.target.value, event.target.selectionStart)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={disabled ? "当前没有发送权限" : rootMessageId ? "回复该话题..." : "发送消息..."}
          ref={textAreaRef}
          rows={3}
          value={draft.text}
        />
        {mentionRange && (
          <div className="orf-chat-mention-menu">
            {mentionUsers.length > 0 ? mentionUsers.map((user, index) => (
              <button
                className={index === selectedMention ? "orf-chat-mention-option-active" : ""}
                key={user.id}
                type="button"
                onClick={() => insertMention(user)}
              >
                <Avatar avatarUrl={user.avatarUrl} name={user.name} size="sm" />
                <span>{user.name}</span>
                <small>{user.email}</small>
              </button>
            )) : <div className="orf-chat-mention-empty">没有匹配成员</div>}
          </div>
        )}
        <div className="orf-chat-composer-toolbar">
          <button type="button" onClick={() => insertMarkdown("**")} title="加粗"><Bold className="h-4 w-4" /></button>
          <button type="button" onClick={() => insertMarkdown("_")} title="斜体"><Italic className="h-4 w-4" /></button>
          <button type="button" onClick={() => insertMarkdown("`")} title="代码"><Code className="h-4 w-4" /></button>
          <button type="button" onClick={() => insertMarkdown("> ", "")} title="引用"><Quote className="h-4 w-4" /></button>
          <button type="button" onClick={() => insertMarkdown("[", "](https://)")} title="链接"><LinkIcon className="h-4 w-4" /></button>
          <button type="button" onClick={() => fileRef.current?.click()} title="附件"><Paperclip className="h-4 w-4" /></button>
          <button type="button" onClick={() => insertMarkdown("@", "")} title="提及成员"><AtSign className="h-4 w-4" /></button>
          <span className="orf-chat-composer-spacer" />
          {uploading && <Loader2 className="h-4 w-4 animate-spin" />}
          <button type="button" className="orf-chat-send-button" disabled={disabled || uploading} onClick={() => void submit()} title="发送">
            <Send className="h-4 w-4" />
          </button>
          <input multiple hidden ref={fileRef} type="file" onChange={(event) => void handleFiles(event)} />
        </div>
      </div>
    </div>
  );
}

function TypingLine({ typingByUser }: { typingByUser: Map<string, TypingState> }) {
  const names = Array.from(typingByUser.values()).map((typing) => typing.userName);
  return <div className="orf-chat-typing-line">{names.length > 0 ? `${names.join(", ")} 正在输入` : "\u00a0"}</div>;
}

function ChatRightPanel(props: {
  activePanel: ActivePanel;
  allUsers: ChatUser[];
  canManage: boolean;
  channel: ChatChannel;
  collectionLoading: boolean;
  collectionResults: ChatSearchResult[];
  currentUserId?: string;
  onAddMembers: (userIds: string[]) => Promise<void>;
  onClose: () => void;
  onCopyLink: (message: ChatMessage) => void;
  onDelete: (message: ChatMessage) => void;
  onDraftStateChange: (channelId: string, hasDraft: boolean) => void;
  onEdit: (message: ChatMessage) => void;
  onImage: (attachment: ChatAttachment) => void;
  onMarkUnread: (message: ChatMessage) => void;
  onOpenResult: (result: ChatSearchResult) => void;
  onOpenThreadSummary: (summary: ChatThreadSummary) => void;
  onPin: (message: ChatMessage) => void;
  onReaction: (message: ChatMessage, emojiName: string) => void;
  onRemoveMember: (userId: string) => Promise<void>;
  onSave: (message: ChatMessage) => void;
  onSearch: (input?: { query?: string; scope?: ChatSearchScope; type?: ChatSearchTypeFilter }) => Promise<void>;
  onSendThreadReply: (draft: ChatDraft, attachments: ChatAttachment[], rootMessageId?: string | null, parentMessageId?: string | null) => Promise<void>;
  onToggleFollow: (following: boolean) => void;
  onTyping: () => void;
  onUpdateChannel: (input: Partial<Pick<ChatChannel, "displayName" | "header" | "purpose">>) => Promise<void>;
  searchQuery: string;
  searchScope: ChatSearchScope;
  searchResults: ChatSearchResult[];
  searchType: ChatSearchTypeFilter;
  setSearchQuery: (value: string) => void;
  setSearchScope: (value: ChatSearchScope) => void;
  setSearchType: (value: ChatSearchTypeFilter) => void;
  thread: ChatThread | null;
  threadLoading: boolean;
  threadSummaries: ChatThreadSummary[];
  threadSummariesLoading: boolean;
  users: ChatUser[];
  usersById: Map<string, ChatUser>;
}) {
  const title =
    props.activePanel === "thread" ? "话题"
      : props.activePanel === "threads" ? "话题收件箱"
      : props.activePanel === "search" ? "搜索"
        : props.activePanel === "pins" ? "固定消息"
          : props.activePanel === "saved" ? "已保存"
            : "频道信息";
  return (
    <aside className="orf-chat-right-panel">
      <div className="orf-chat-right-header">
        <strong>{title}</strong>
        <IconButton icon={X} label="关闭" onClick={props.onClose} />
      </div>
      {props.activePanel === "thread" && (
        props.thread ? (
          <ThreadPanel
            canPin={props.canManage}
            currentUserId={props.currentUserId}
            onCopyLink={props.onCopyLink}
            onDelete={props.onDelete}
            onDraftStateChange={props.onDraftStateChange}
            onEdit={props.onEdit}
            onImage={props.onImage}
            onMarkUnread={props.onMarkUnread}
            onPin={props.onPin}
            onReaction={props.onReaction}
            onSave={props.onSave}
            onSend={props.onSendThreadReply}
            onToggleFollow={props.onToggleFollow}
            onTyping={props.onTyping}
            thread={props.thread}
            users={props.users}
            usersById={props.usersById}
          />
        ) : (
          <div className="orf-chat-panel-loading">
            {props.threadLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <MessageSquare className="h-5 w-5" />}
            <span>{props.threadLoading ? "正在加载话题" : "没有可显示的话题"}</span>
          </div>
        )
      )}
      {props.activePanel === "search" && (
        <SearchPanel
          onOpenResult={props.onOpenResult}
          onSearch={props.onSearch}
          query={props.searchQuery}
          searchScope={props.searchScope}
          searchType={props.searchType}
          results={props.searchResults}
          setQuery={props.setSearchQuery}
          setSearchScope={props.setSearchScope}
          setSearchType={props.setSearchType}
          usersById={props.usersById}
        />
      )}
      {props.activePanel === "threads" && (
        <ThreadInboxPanel
          loading={props.threadSummariesLoading}
          onOpenThread={props.onOpenThreadSummary}
          summaries={props.threadSummaries}
          usersById={props.usersById}
        />
      )}
      {(props.activePanel === "pins" || props.activePanel === "saved") && (
        <CollectionPanel
          kind={props.activePanel}
          loading={props.collectionLoading}
          onOpenResult={props.onOpenResult}
          onSave={props.onSave}
          results={props.collectionResults}
          usersById={props.usersById}
        />
      )}
      {props.activePanel === "info" && (
        <ChannelInfoPanel
          canManage={props.canManage}
          channel={props.channel}
          currentUserId={props.currentUserId}
          onAddMembers={props.onAddMembers}
          onRemoveMember={props.onRemoveMember}
          onUpdateChannel={props.onUpdateChannel}
          users={props.allUsers}
          usersById={props.usersById}
        />
      )}
    </aside>
  );
}

function ThreadInboxPanel({
  loading,
  onOpenThread,
  summaries,
  usersById,
}: {
  loading: boolean;
  onOpenThread: (summary: ChatThreadSummary) => void;
  summaries: ChatThreadSummary[];
  usersById: Map<string, ChatUser>;
}) {
  if (loading && summaries.length === 0) {
    return (
      <div className="orf-chat-panel-loading">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>正在加载话题收件箱</span>
      </div>
    );
  }
  if (summaries.length === 0) {
    return (
      <div className="orf-chat-panel-loading">
        <Reply className="h-5 w-5" />
        <span>暂无关注的话题</span>
      </div>
    );
  }
  return (
    <div className="orf-chat-thread-inbox">
      {loading && (
        <div className="orf-chat-thread-inbox-sync">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          同步话题
        </div>
      )}
      {summaries.map((summary) => (
        <button type="button" key={summary.rootMessage.id} onClick={() => onOpenThread(summary)}>
          <span>{summary.channel.displayName}</span>
          {summary.unreadCount > 0 && <strong>{summary.unreadCount}</strong>}
          <b>{summary.rootMessage.authorName}</b>
          <div className="orf-chat-thread-inbox-body">
            {summary.rootMessage.body.trim() ? renderTextFragments(summary.rootMessage.body, usersById) : "附件话题"}
          </div>
          <small>
            {summary.rootMessage.replyCount} 条回复
            {summary.rootMessage.lastReplyAt ? ` · 最近 ${formatTime(summary.rootMessage.lastReplyAt)}` : ""}
          </small>
        </button>
      ))}
    </div>
  );
}

function ThreadPanel({
  canPin,
  currentUserId,
  onCopyLink,
  onDelete,
  onDraftStateChange,
  onEdit,
  onImage,
  onMarkUnread,
  onPin,
  onReaction,
  onSave,
  onSend,
  onToggleFollow,
  onTyping,
  thread,
  users,
  usersById,
}: {
  canPin: boolean;
  currentUserId?: string;
  onCopyLink: (message: ChatMessage) => void;
  onDelete: (message: ChatMessage) => void;
  onDraftStateChange: (channelId: string, hasDraft: boolean) => void;
  onEdit: (message: ChatMessage) => void;
  onImage: (attachment: ChatAttachment) => void;
  onMarkUnread: (message: ChatMessage) => void;
  onPin: (message: ChatMessage) => void;
  onReaction: (message: ChatMessage, emojiName: string) => void;
  onSave: (message: ChatMessage) => void;
  onSend: (draft: ChatDraft, attachments: ChatAttachment[], rootMessageId?: string | null, parentMessageId?: string | null) => Promise<void>;
  onToggleFollow: (following: boolean) => void;
  onTyping: () => void;
  thread: ChatThread;
  users: ChatUser[];
  usersById: Map<string, ChatUser>;
}) {
  const threadPanelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    window.requestAnimationFrame(() => {
      const element = threadPanelRef.current;
      if (!element) return;
      element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
    });
  }, [thread.replies.length]);

  return (
    <div className="orf-chat-thread-panel" ref={threadPanelRef}>
      <MessageItem
        canPin={canPin}
        currentUserId={currentUserId}
        message={thread.rootMessage}
        onCopyLink={onCopyLink}
        onDelete={onDelete}
        onEdit={onEdit}
        onImage={onImage}
        onMarkUnread={onMarkUnread}
        onPin={onPin}
        onReaction={onReaction}
        onSave={onSave}
        onThread={() => undefined}
        usersById={usersById}
      />
      <button type="button" className="orf-chat-follow-button" onClick={() => onToggleFollow(!thread.following)}>
        {thread.following ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
        {thread.following ? "取消关注话题" : "关注话题"}
      </button>
      <div className="orf-chat-thread-replies">
        {thread.replies.map((reply) => (
          <MessageItem
            canPin={canPin}
            currentUserId={currentUserId}
            key={reply.id}
            message={reply}
            onCopyLink={onCopyLink}
            onDelete={onDelete}
            onEdit={onEdit}
            onImage={onImage}
            onMarkUnread={onMarkUnread}
            onPin={onPin}
            onReaction={onReaction}
            onSave={onSave}
            onThread={() => undefined}
            usersById={usersById}
          />
        ))}
      </div>
      <ChatComposer
        channelId={thread.rootMessage.channelId}
        mentionableUsers={users}
        onDraftStateChange={onDraftStateChange}
        onSend={onSend}
        onTyping={onTyping}
        parentMessageId={thread.replies.at(-1)?.id ?? thread.rootMessage.id}
        rootMessageId={thread.rootMessage.id}
      />
    </div>
  );
}

function CollectionPanel({
  kind,
  loading,
  onOpenResult,
  onSave,
  results,
  usersById,
}: {
  kind: "pins" | "saved";
  loading: boolean;
  onOpenResult: (result: ChatSearchResult) => void;
  onSave: (message: ChatMessage) => void;
  results: ChatSearchResult[];
  usersById: Map<string, ChatUser>;
}) {
  const empty = kind === "pins" ? "当前频道还没有固定消息。" : "还没有保存过消息。";
  return (
    <div className="orf-chat-collection-panel">
      <div className="orf-chat-collection-caption">
        {kind === "pins" ? <Pin className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
        <span>{kind === "pins" ? "当前频道固定的消息" : "你保存的可见消息"}</span>
      </div>
      {loading ? (
        <div className="orf-chat-search-empty"><Loader2 className="h-5 w-5 animate-spin" /> 加载中</div>
      ) : (
        <div className="orf-chat-collection-results">
          {results.map((result) => (
            <article className="orf-chat-collection-item" key={result.message.id}>
              <button type="button" onClick={() => onOpenResult(result)}>
                <span>{result.channel.displayName}</span>
                <strong>{result.message.authorName}</strong>
                <small>{formatDay(result.message.createdAt)} {formatTime(result.message.createdAt)}</small>
                <div className="orf-chat-collection-body">{renderTextFragments(result.message.body, usersById)}</div>
              </button>
              <IconButton
                className={result.message.savedByCurrentUser ? "orf-chat-message-action-active" : ""}
                icon={Bookmark}
                label={result.message.savedByCurrentUser ? "取消保存" : "保存消息"}
                onClick={() => onSave(result.message)}
              />
            </article>
          ))}
          {results.length === 0 && <div className="orf-chat-search-empty">{empty}</div>}
        </div>
      )}
    </div>
  );
}

function SearchPanel({
  onOpenResult,
  onSearch,
  query,
  results,
  searchScope,
  searchType,
  setQuery,
  setSearchScope,
  setSearchType,
  usersById,
}: {
  onOpenResult: (result: ChatSearchResult) => void;
  onSearch: (input?: { query?: string; scope?: ChatSearchScope; type?: ChatSearchTypeFilter }) => Promise<void>;
  query: string;
  results: ChatSearchResult[];
  searchScope: ChatSearchScope;
  searchType: ChatSearchTypeFilter;
  setQuery: (value: string) => void;
  setSearchScope: (value: ChatSearchScope) => void;
  setSearchType: (value: ChatSearchTypeFilter) => void;
  usersById: Map<string, ChatUser>;
}) {
  const applyScope = (scope: ChatSearchScope) => {
    setSearchScope(scope);
    if (query.trim()) void onSearch({ query, scope, type: searchType });
  };
  const applyType = (type: ChatSearchTypeFilter) => {
    setSearchType(type);
    if (query.trim()) void onSearch({ query, scope: searchScope, type });
  };

  return (
    <div className="orf-chat-search-panel">
      <form onSubmit={(event) => { event.preventDefault(); void onSearch({ query }); }}>
        <Search className="h-4 w-4" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索可见范围内的消息" />
      </form>
      <div className="orf-chat-search-filters">
        <div className="orf-chat-segmented">
          <button type="button" className={searchScope === "all" ? "active" : ""} onClick={() => applyScope("all")}>全部可见</button>
          <button type="button" className={searchScope === "current" ? "active" : ""} onClick={() => applyScope("current")}>当前频道</button>
        </div>
        <div className="orf-chat-segmented">
          {[
            ["all", "全部"],
            ["public", "公开"],
            ["private", "私有"],
            ["direct", "私信"],
            ["group", "群聊"],
          ].map(([value, label]) => (
            <button
              type="button"
              className={searchType === value ? "active" : ""}
              key={value}
              onClick={() => applyType(value as ChatSearchTypeFilter)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="orf-chat-search-results">
        {results.map((result) => (
          <button type="button" key={result.message.id} onClick={() => onOpenResult(result)}>
            <span>{result.channel.displayName}</span>
            <strong>{result.message.authorName}</strong>
            <SearchResultPreview message={result.message} usersById={usersById} />
          </button>
        ))}
        {results.length === 0 && <div className="orf-chat-search-empty">输入关键词后搜索。</div>}
      </div>
    </div>
  );
}

function SearchResultPreview({ message, usersById }: { message: ChatMessage; usersById: Map<string, ChatUser> }) {
  return (
    <>
      <div className="orf-chat-search-result-body">
        {message.body.trim() ? renderTextFragments(message.body, usersById) : <span className="orf-chat-search-attachment-only">附件消息</span>}
      </div>
      {message.attachments.length > 0 && (
        <div className="orf-chat-search-attachments">
          {message.attachments.slice(0, 3).map((attachment) => (
            <span key={attachment.id}>
              {attachment.mimeType.startsWith("image/") ? <ImageIcon className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
              {attachment.fileName}
            </span>
          ))}
        </div>
      )}
    </>
  );
}

function ChannelInfoPanel({
  canManage,
  channel,
  currentUserId,
  onAddMembers,
  onRemoveMember,
  onUpdateChannel,
  users,
  usersById,
}: {
  canManage: boolean;
  channel: ChatChannel;
  currentUserId?: string;
  onAddMembers: (userIds: string[]) => Promise<void>;
  onRemoveMember: (userId: string) => Promise<void>;
  onUpdateChannel: (input: Partial<Pick<ChatChannel, "displayName" | "header" | "purpose">>) => Promise<void>;
  users: ChatUser[];
  usersById: Map<string, ChatUser>;
}) {
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [displayName, setDisplayName] = useState(channel.displayName);
  const [purpose, setPurpose] = useState(channel.purpose);
  const [header, setHeader] = useState(channel.header);
  const [savingDetails, setSavingDetails] = useState(false);
  const memberIds = new Set(channel.members.map((member) => member.userId));
  const candidates = users.filter((user) => !memberIds.has(user.id));
  const canEditMetadata = canManage && channel.type !== "direct" && channel.type !== "group";
  const detailsChanged = displayName !== channel.displayName || purpose !== channel.purpose || header !== channel.header;

  useEffect(() => {
    setDisplayName(channel.displayName);
    setPurpose(channel.purpose);
    setHeader(channel.header);
    setSavingDetails(false);
  }, [channel.displayName, channel.header, channel.id, channel.purpose]);

  const saveDetails = async () => {
    if (!canEditMetadata || !displayName.trim()) return;
    setSavingDetails(true);
    try {
      await onUpdateChannel({ displayName: displayName.trim(), purpose: purpose.trim(), header: header.trim() });
    } finally {
      setSavingDetails(false);
    }
  };

  return (
    <div className="orf-chat-info-panel">
      {canEditMetadata ? (
        <div className="orf-chat-info-section">
          <label>频道设置</label>
          <div className="orf-chat-info-fields">
            <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="频道名" />
            <textarea value={purpose} onChange={(event) => setPurpose(event.target.value)} placeholder="频道说明" rows={3} />
            <textarea value={header} onChange={(event) => setHeader(event.target.value)} placeholder="频道标题" rows={3} />
          </div>
          <Button disabled={!detailsChanged || !displayName.trim() || savingDetails} onClick={() => void saveDetails()} variant="secondary">
            {savingDetails ? "保存中" : "保存频道设置"}
          </Button>
        </div>
      ) : (
        <>
          <div className="orf-chat-info-section">
            <label>频道说明</label>
            <p>{channel.purpose || "暂无说明"}</p>
          </div>
          <div className="orf-chat-info-section">
            <label>频道标题</label>
            <p>{channel.header || "暂无标题"}</p>
          </div>
        </>
      )}
      {canManage && channel.type !== "public" && (
        <div className="orf-chat-info-section">
          <label>添加成员</label>
          {candidates.length > 0 ? (
            <>
              <div className="orf-chat-member-picker">
                {candidates.slice(0, 10).map((user) => (
                  <button
                    className={selectedUserIds.includes(user.id) ? "orf-chat-member-selected" : ""}
                    key={user.id}
                    type="button"
                    onClick={() => setSelectedUserIds((items) => items.includes(user.id) ? items.filter((id) => id !== user.id) : [...items, user.id])}
                  >
                    <span className="orf-chat-member-avatar">
                      <Avatar avatarUrl={user.avatarUrl} name={user.name} size="sm" />
                      <i className={clsx("orf-chat-presence-dot", isChatUserOnline(user, currentUserId) && "orf-chat-presence-online")} />
                    </span>
                    <span>{user.name}</span>
                    <small>{formatPresence(user, currentUserId)}</small>
                  </button>
                ))}
              </div>
              <Button disabled={selectedUserIds.length === 0} onClick={() => void onAddMembers(selectedUserIds).then(() => setSelectedUserIds([]))} variant="secondary">
                添加成员
              </Button>
            </>
          ) : (
            <div className="orf-chat-member-empty">没有可添加成员</div>
          )}
        </div>
      )}
      <div className="orf-chat-info-section">
        <label>成员</label>
        <div className="orf-chat-member-list">
          {channel.members.map((member) => {
            const user = usersById.get(member.userId);
            return (
              <div key={member.userId}>
                <span className="orf-chat-member-avatar">
                  <Avatar avatarUrl={user?.avatarUrl} name={user?.name ?? "成员"} size="sm" />
                  <i className={clsx("orf-chat-presence-dot", isChatUserOnline(user, currentUserId) && "orf-chat-presence-online")} />
                </span>
                <span>{user?.name ?? member.userId}</span>
                <small>{member.role} · {formatPresence(user, currentUserId)}</small>
                {canManage && channel.type !== "public" && member.userId !== currentUserId && (
                  <button type="button" onClick={() => void onRemoveMember(member.userId)}>移除</button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ChannelModal({
  canCreatePublic,
  currentUserId,
  onClose,
  onCreate,
  users,
}: {
  canCreatePublic: boolean;
  currentUserId?: string;
  onClose: () => void;
  onCreate: (input: { displayName: string; header?: string; memberUserIds?: string[]; name?: string; purpose?: string; type: "public" | "private" }) => Promise<void>;
  users: ChatUser[];
}) {
  const [type, setType] = useState<"public" | "private">("private");
  const [displayName, setDisplayName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [header, setHeader] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    setSaving(true);
    try {
      await onCreate({ type, displayName, purpose, header, memberUserIds: selected });
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="orf-chat-modal-backdrop" onMouseDown={onClose}>
      <div className="orf-chat-modal" onMouseDown={(event) => event.stopPropagation()}>
        <header><h2>新建频道</h2><IconButton icon={X} label="关闭" onClick={onClose} /></header>
        <div className="orf-chat-segmented">
          <button className={type === "private" ? "active" : ""} type="button" onClick={() => setType("private")}>私有</button>
          <button className={type === "public" ? "active" : ""} disabled={!canCreatePublic} type="button" onClick={() => setType("public")}>公开</button>
        </div>
        <label>频道名<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>
        <label>说明<input value={purpose} onChange={(event) => setPurpose(event.target.value)} /></label>
        <label>标题<input value={header} onChange={(event) => setHeader(event.target.value)} /></label>
        {type === "private" && (
          <div className="orf-chat-modal-users">
            {users.map((user) => (
              <button className={selected.includes(user.id) ? "selected" : ""} key={user.id} type="button" onClick={() => setSelected((items) => items.includes(user.id) ? items.filter((id) => id !== user.id) : [...items, user.id])}>
                <span className="orf-chat-member-avatar">
                  <Avatar avatarUrl={user.avatarUrl} name={user.name} size="sm" />
                  <i className={clsx("orf-chat-presence-dot", isChatUserOnline(user, currentUserId) && "orf-chat-presence-online")} />
                </span>
                <span>{user.name}</span>
                <small>{formatPresence(user, currentUserId)}</small>
              </button>
            ))}
          </div>
        )}
        <footer>
          <Button onClick={onClose} variant="secondary">取消</Button>
          <Button disabled={!displayName.trim() || saving} onClick={() => void submit()}>{saving ? "创建中" : "创建"}</Button>
        </footer>
      </div>
    </div>
  );
}

function ConversationModal({
  currentUserId,
  onClose,
  onOpen,
  users,
}: {
  currentUserId?: string;
  onClose: () => void;
  onOpen: (userIds: string[]) => Promise<void>;
  users: ChatUser[];
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const candidates = users.filter((user) => user.id !== currentUserId && (user.name.includes(query) || user.email.includes(query)));
  const submit = async () => {
    setSaving(true);
    try {
      await onOpen(selected);
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="orf-chat-modal-backdrop" onMouseDown={onClose}>
      <div className="orf-chat-modal" onMouseDown={(event) => event.stopPropagation()}>
        <header><h2>新建私聊/群聊</h2><IconButton icon={X} label="关闭" onClick={onClose} /></header>
        <label>查找成员<input value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        <div className="orf-chat-modal-users">
          {candidates.map((user) => (
            <button className={selected.includes(user.id) ? "selected" : ""} key={user.id} type="button" onClick={() => setSelected((items) => items.includes(user.id) ? items.filter((id) => id !== user.id) : [...items, user.id])}>
              <span className="orf-chat-member-avatar">
                <Avatar avatarUrl={user.avatarUrl} name={user.name} size="sm" />
                <i className={clsx("orf-chat-presence-dot", isChatUserOnline(user, currentUserId) && "orf-chat-presence-online")} />
              </span>
              <span>{user.name}</span>
              <small>{formatPresence(user, currentUserId)}</small>
            </button>
          ))}
        </div>
        <footer>
          <Button onClick={onClose} variant="secondary">取消</Button>
          <Button disabled={selected.length === 0 || saving} onClick={() => void submit()}>{saving ? "打开中" : "打开"}</Button>
        </footer>
      </div>
    </div>
  );
}

function EditMessageDialog({
  draft,
  onClose,
  onSave,
}: {
  draft: ChatDraft;
  onClose: () => void;
  onSave: (draft: ChatDraft) => void;
}) {
  const [localDraft, setLocalDraft] = useState(draft);
  const save = () => onSave(localDraft);
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.altKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      save();
    }
  };
  return (
    <div className="orf-chat-modal-backdrop" onMouseDown={onClose}>
      <div className="orf-chat-modal orf-chat-edit-modal" onMouseDown={(event) => event.stopPropagation()}>
        <header><h2>编辑消息</h2><IconButton icon={X} label="关闭" onClick={onClose} /></header>
        <textarea
          value={localDraft.text}
          onChange={(event) => {
            const text = event.target.value;
            setLocalDraft((previous) => ({
              text,
              mentions: reconcileMentions(previous.text, text, previous.mentions),
            }));
          }}
          onKeyDown={handleKeyDown}
          rows={6}
        />
        <footer>
          <Button onClick={onClose} variant="secondary">取消</Button>
          <Button onClick={save}>保存</Button>
        </footer>
      </div>
    </div>
  );
}

function ImagePreview({ attachment, onClose }: { attachment: ChatAttachment; onClose: () => void }) {
  return (
    <div className="orf-chat-image-preview" onMouseDown={onClose}>
      <button type="button" onClick={onClose}><X className="h-5 w-5" /></button>
      <img src={attachment.contentUrl} alt={attachment.fileName} />
      <span>{attachment.fileName}</span>
    </div>
  );
}
