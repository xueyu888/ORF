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
  MoreHorizontal,
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
import { type ChangeEvent, type KeyboardEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Avatar, Button, IconButton } from "../components/ui";
import {
  addChatChannelMembersRequest,
  archiveChatChannelRequest,
  createChatChannel,
  deleteChatMessageRequest,
  getChatBootstrap,
  getChatMentionableUsers,
  getChatMessages,
  getChatThread,
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
import type { ChatAttachment, ChatBootstrap, ChatChannel, ChatMessage, ChatSearchResult, ChatThread, ChatUser } from "../types/orf";
import type { ChatRealtimeEvent } from "../types/realtime";

type DraftMention = {
  end: number;
  label: string;
  start: number;
  userId: string;
};

type ChatDraft = {
  mentions: DraftMention[];
  text: string;
};

type ActivePanel = "thread" | "info" | "search" | "pins" | "saved" | null;

type TypingState = {
  expiresAt: string;
  userId: string;
  userName: string;
};

type UnreadAnchor = {
  channelId: string;
  lastReadAt?: string | null;
  manuallyUnread: boolean;
  mentionCount: number;
  threadUnreadCount: number;
  unreadCount: number;
};

const reactionEmojis = ["👍", "👀", "✅", "❤️", "🔥", "🎉", "😂", "😮", "🙏"];
const emptyDraft: ChatDraft = { mentions: [], text: "" };

function chatDraftStorageKey(channelId: string, rootMessageId?: string | null) {
  return `orf.chat.draft.${channelId}.${rootMessageId ?? "root"}`;
}

function hasStoredDraftForChannel(channelId: string) {
  if (typeof window === "undefined") return false;
  const prefix = `orf.chat.draft.${channelId}.`;
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key?.startsWith(prefix) && parseStoredDraft(window.localStorage.getItem(key)).text.trim()) {
      return true;
    }
  }
  return false;
}

function storedDraftChannelIds(channels: ChatChannel[]) {
  return new Set(channels.filter((channel) => hasStoredDraftForChannel(channel.id)).map((channel) => channel.id));
}

function parseStoredDraft(raw: string | null): ChatDraft {
  if (!raw) return emptyDraft;
  try {
    const draft = JSON.parse(raw) as Partial<ChatDraft>;
    const text = typeof draft.text === "string" ? draft.text.slice(0, 20000) : "";
    const mentions = Array.isArray(draft.mentions)
      ? draft.mentions.filter((mention): mention is DraftMention => (
          typeof mention === "object" &&
          mention !== null &&
          typeof mention.start === "number" &&
          typeof mention.end === "number" &&
          typeof mention.label === "string" &&
          typeof mention.userId === "string" &&
          text.slice(mention.start, mention.end) === `@${mention.label}`
        ))
      : [];
    return { text, mentions };
  } catch {
    return emptyDraft;
  }
}

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

function currentMembership(channel: ChatChannel | null, userId: string | undefined) {
  return channel?.members.find((member) => member.userId === userId) ?? null;
}

function sortChannels(channels: ChatChannel[], currentUserId?: string) {
  return [...channels].sort((left, right) => {
    const leftMember = currentMembership(left, currentUserId);
    const rightMember = currentMembership(right, currentUserId);
    if (Boolean(leftMember?.favorite) !== Boolean(rightMember?.favorite)) return leftMember?.favorite ? -1 : 1;
    return (right.lastMessageAt ?? right.updatedAt).localeCompare(left.lastMessageAt ?? left.updatedAt);
  });
}

function upsertChannel(channels: ChatChannel[], next: ChatChannel, currentUserId?: string) {
  const found = channels.some((channel) => channel.id === next.id);
  return sortChannels(found ? channels.map((channel) => (channel.id === next.id ? next : channel)) : [next, ...channels], currentUserId);
}

function upsertMessage(messages: ChatMessage[], next: ChatMessage) {
  const found = messages.some((message) => message.id === next.id);
  const updated = found ? messages.map((message) => (message.id === next.id ? next : message)) : [...messages, next];
  return updated.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

function mentionLabel(value: string) {
  return value.replace(/[()[\]\n]/g, "").trim() || "成员";
}

function mentionToken(mention: Pick<DraftMention, "label" | "userId">) {
  return `@[${mentionLabel(mention.label)}](orf-user:${encodeURIComponent(mention.userId)})`;
}

function serializeDraft(draft: ChatDraft) {
  const validMentions = draft.mentions
    .filter((mention) => draft.text.slice(mention.start, mention.end) === `@${mention.label}`)
    .sort((left, right) => left.start - right.start);
  let output = "";
  let index = 0;
  for (const mention of validMentions) {
    if (mention.start < index) continue;
    output += draft.text.slice(index, mention.start);
    output += mentionToken(mention);
    index = mention.end;
  }
  return output + draft.text.slice(index);
}

function draftFromStoredBody(body: string, usersById: Map<string, ChatUser>): ChatDraft {
  const pattern = /@\[([^\]\n]*)\]\(orf-user:([^) \n]+)\)/g;
  const mentions: DraftMention[] = [];
  let text = "";
  let index = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(body)) !== null) {
    text += body.slice(index, match.index);
    const userId = decodeURIComponent(match[2] ?? "");
    const label = mentionLabel(usersById.get(userId)?.name ?? match[1] ?? "成员");
    const start = text.length;
    text += `@${label}`;
    mentions.push({ start, end: text.length, label, userId });
    index = pattern.lastIndex;
  }
  text += body.slice(index);
  return { text, mentions };
}

function mentionRangeFor(value: string, cursor: number, mentions: DraftMention[]) {
  if (mentions.some((mention) => cursor > mention.start && cursor <= mention.end)) return null;
  const prefix = value.slice(0, cursor);
  const match = /(^|\s)@([^\s@]{0,32})$/.exec(prefix);
  if (!match || match.index === undefined) return null;
  const atIndex = prefix.lastIndexOf("@");
  return { start: atIndex, end: cursor, query: match[2] ?? "" };
}

function reconcileMentions(previousText: string, nextText: string, mentions: DraftMention[]) {
  if (mentions.length === 0) return mentions;
  let prefixLength = 0;
  while (prefixLength < previousText.length && prefixLength < nextText.length && previousText[prefixLength] === nextText[prefixLength]) {
    prefixLength += 1;
  }
  let previousSuffix = previousText.length;
  let nextSuffix = nextText.length;
  while (previousSuffix > prefixLength && nextSuffix > prefixLength && previousText[previousSuffix - 1] === nextText[nextSuffix - 1]) {
    previousSuffix -= 1;
    nextSuffix -= 1;
  }
  const delta = nextText.length - previousText.length;
  return mentions
    .flatMap((mention) => {
      if (mention.end <= prefixLength) return [mention];
      if (mention.start >= previousSuffix) return [{ ...mention, start: mention.start + delta, end: mention.end + delta }];
      return [];
    })
    .filter((mention) => nextText.slice(mention.start, mention.end) === `@${mention.label}`);
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
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState<"channel" | "conversation" | null>(null);
  const [searchResults, setSearchResults] = useState<ChatSearchResult[]>([]);
  const [collectionResults, setCollectionResults] = useState<ChatSearchResult[]>([]);
  const [collectionLoading, setCollectionLoading] = useState(false);
  const [draftChannelIds, setDraftChannelIds] = useState<Set<string>>(new Set());
  const [typingByUser, setTypingByUser] = useState<Map<string, TypingState>>(new Map());
  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);
  const [imagePreview, setImagePreview] = useState<ChatAttachment | null>(null);
  const [unreadAnchor, setUnreadAnchor] = useState<UnreadAnchor | null>(null);
  const lastTypingSentAtRef = useRef(0);
  const activeChannel = channels.find((channel) => channel.id === routeChannelId) ?? channels[0] ?? null;
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

  const applyMessage = useCallback((message: ChatMessage) => {
    setMessages((items) => (!message.rootMessageId || items.some((item) => item.id === message.id) ? upsertMessage(items, message) : items));
    setThread((item) => item ? {
      ...item,
      rootMessage: item.rootMessage.id === message.id ? message : item.rootMessage,
      replies: item.replies.some((reply) => reply.id === message.id)
        ? upsertMessage(item.replies, message).filter((reply) => reply.rootMessageId === item.rootMessage.id)
        : item.replies,
    } : item);
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
      .then((data) => {
        if (cancelled) return;
        const first = routeChannelId ? data.channels.find((channel) => channel.id === routeChannelId) : data.channels[0];
        if (!routeChannelId && first) navigate(`/chat/${encodeURIComponent(first.id)}`, { replace: true });
      })
      .catch((error) => notify(error instanceof Error ? error.message : "加载聊天失败"))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [navigate, notify, refreshBootstrap, routeChannelId]);

  useEffect(() => {
    setDraftChannelIds(storedDraftChannelIds(channels));
  }, [channels]);

  useEffect(() => {
    if (!activeChannel) return undefined;
    let cancelled = false;
    lastTypingSentAtRef.current = 0;
    const activeMember = currentMembership(activeChannel, currentUser?.id);
    const hasUnreadState =
      activeChannel.unreadCount > 0 ||
      activeChannel.mentionCount > 0 ||
      activeChannel.threadUnreadCount > 0 ||
      Boolean(activeMember?.manuallyUnread);
    setUnreadAnchor(hasUnreadState ? {
      channelId: activeChannel.id,
      lastReadAt: activeMember?.lastReadAt ?? null,
      manuallyUnread: Boolean(activeMember?.manuallyUnread),
      mentionCount: activeChannel.mentionCount,
      threadUnreadCount: activeChannel.threadUnreadCount,
      unreadCount: activeChannel.unreadCount,
    } : null);
    setMessagesLoading(true);
    setMessages([]);
    setHasOlderMessages(false);
    void getChatMessages({ channelId: activeChannel.id, limit: 80 })
      .then((response) => {
        if (!cancelled) {
          setMessages(response.messages);
          setHasOlderMessages(response.messages.length >= 80);
        }
      })
      .catch((error) => notify(error instanceof Error ? error.message : "加载消息失败"))
      .finally(() => {
        if (!cancelled) setMessagesLoading(false);
      });
    void markChatChannelReadRequest(activeChannel.id)
      .then((response) => applyChannel(response.channel))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [activeChannel?.id, applyChannel, currentUser?.id, notify]);

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
        applyMessage(payload.message);
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
  }, [activeChannel, applyChannel, applyMessage, currentUser?.id, navigate]);

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
    setOlderMessagesLoading(true);
    try {
      const response = await getChatMessages({ channelId: activeChannel.id, before: messages[0].createdAt, limit: 80 });
      setMessages((items) => [...response.messages, ...items]);
      setHasOlderMessages(response.messages.length >= 80);
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
      }
      void markChatChannelReadRequest(activeChannel.id).then((read) => applyChannel(read.channel)).catch(() => undefined);
    },
    [activeChannel, applyChannel, applyMessage],
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

  const handleJumpToUnread = useCallback(() => {
    const target =
      document.getElementById("orf-chat-unread-divider") ??
      document.querySelector<HTMLElement>("[data-chat-unread-message='true']");
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
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

  const handleSearch = useCallback(
    async (value = query) => {
      if (!value.trim()) {
        setSearchResults([]);
        return;
      }
      setActivePanel("search");
      const response = await searchChat({ q: value });
      setSearchResults(response.results);
    },
    [query],
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
        query={query}
        setQuery={setQuery}
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
            <div className="orf-chat-message-scroll">
              {messagesLoading ? (
                <div className="orf-chat-message-loading"><Loader2 className="h-5 w-5 animate-spin" /> 加载消息</div>
              ) : (
                <MessageList
                  currentUserId={currentUser?.id}
                  focusMessageId={focusMessageId}
                  hasOlderMessages={hasOlderMessages}
                  loadingOlderMessages={olderMessagesLoading}
                  messages={messages}
                  onDelete={handleDeleteMessage}
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
          onOpenResult={(result) => {
            navigate(`/chat/${encodeURIComponent(result.channel.id)}?message=${encodeURIComponent(result.message.rootMessageId ?? result.message.id)}`);
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
          searchQuery={query}
          searchResults={searchResults}
          setSearchQuery={setQuery}
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
  const favorites = filteredChannels.filter((channel) => currentMembership(channel, currentUserId)?.favorite);
  const publicChannels = filteredChannels.filter((channel) => channel.type === "public");
  const privateChannels = filteredChannels.filter((channel) => channel.type === "private");
  const conversations = filteredChannels.filter((channel) => channel.type === "direct" || channel.type === "group");

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
      {unreadAnchor && (
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
          {canMutate && <IconButton icon={Edit3} label="编辑消息" onClick={() => onEdit(message)} />}
          {canMutate && <IconButton icon={Trash2} label="删除消息" onClick={() => onDelete(message)} />}
          <IconButton icon={MoreHorizontal} label="更多" />
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
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [mentionRange, setMentionRange] = useState<ReturnType<typeof mentionRangeFor>>(null);
  const [selectedMention, setSelectedMention] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
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
    setAttachments([]);
    setError("");
    setMentionRange(null);
    setSelectedMention(0);
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

  const handleFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;
    setUploading(true);
    setError("");
    try {
      const uploaded: ChatAttachment[] = [];
      for (const file of files.slice(0, 10)) {
        const response = await uploadChatAttachment({ channelId, file });
        uploaded.push(response.attachment);
      }
      setAttachments((items) => [...items, ...uploaded]);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "上传附件失败");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  const submit = async () => {
    if (disabled || uploading) return;
    if (!draft.text.trim() && attachments.length === 0) return;
    setError("");
    try {
      await onSend(draft, attachments, rootMessageId, parentMessageId);
      setDraft(emptyDraft);
      setAttachments([]);
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
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      void submit();
    }
  };

  return (
    <div className="orf-chat-composer">
      {attachments.length > 0 && (
        <div className="orf-chat-pending-attachments">
          {attachments.map((attachment) => (
            <span key={attachment.id}>
              {attachment.mimeType.startsWith("image/") ? <ImageIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
              {attachment.fileName}
              <button type="button" onClick={() => setAttachments((items) => items.filter((item) => item.id !== attachment.id))}>
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
  onDelete: (message: ChatMessage) => void;
  onDraftStateChange: (channelId: string, hasDraft: boolean) => void;
  onEdit: (message: ChatMessage) => void;
  onImage: (attachment: ChatAttachment) => void;
  onMarkUnread: (message: ChatMessage) => void;
  onOpenResult: (result: ChatSearchResult) => void;
  onPin: (message: ChatMessage) => void;
  onReaction: (message: ChatMessage, emojiName: string) => void;
  onRemoveMember: (userId: string) => Promise<void>;
  onSave: (message: ChatMessage) => void;
  onSearch: (query?: string) => Promise<void>;
  onSendThreadReply: (draft: ChatDraft, attachments: ChatAttachment[], rootMessageId?: string | null, parentMessageId?: string | null) => Promise<void>;
  onToggleFollow: (following: boolean) => void;
  onTyping: () => void;
  onUpdateChannel: (input: Partial<Pick<ChatChannel, "displayName" | "header" | "purpose">>) => Promise<void>;
  searchQuery: string;
  searchResults: ChatSearchResult[];
  setSearchQuery: (value: string) => void;
  thread: ChatThread | null;
  threadLoading: boolean;
  users: ChatUser[];
  usersById: Map<string, ChatUser>;
}) {
  const title =
    props.activePanel === "thread" ? "话题"
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
          results={props.searchResults}
          setQuery={props.setSearchQuery}
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

function ThreadPanel({
  canPin,
  currentUserId,
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
  return (
    <div className="orf-chat-thread-panel">
      <MessageItem
        canPin={canPin}
        currentUserId={currentUserId}
        message={thread.rootMessage}
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
  setQuery,
  usersById,
}: {
  onOpenResult: (result: ChatSearchResult) => void;
  onSearch: (query?: string) => Promise<void>;
  query: string;
  results: ChatSearchResult[];
  setQuery: (value: string) => void;
  usersById: Map<string, ChatUser>;
}) {
  return (
    <div className="orf-chat-search-panel">
      <form onSubmit={(event) => { event.preventDefault(); void onSearch(query); }}>
        <Search className="h-4 w-4" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索可见范围内的消息" />
      </form>
      <div className="orf-chat-search-results">
        {results.map((result) => (
          <button type="button" key={result.message.id} onClick={() => onOpenResult(result)}>
            <span>{result.channel.displayName}</span>
            <strong>{result.message.authorName}</strong>
            <div className="orf-chat-search-result-body">{renderTextFragments(result.message.body, usersById)}</div>
          </button>
        ))}
        {results.length === 0 && <div className="orf-chat-search-empty">输入关键词后搜索。</div>}
      </div>
    </div>
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
          rows={6}
        />
        <footer>
          <Button onClick={onClose} variant="secondary">取消</Button>
          <Button onClick={() => onSave(localDraft)}>保存</Button>
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
