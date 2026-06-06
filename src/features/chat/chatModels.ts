import type { ChatChannel, ChatMessage, ChatThreadSummary, ChatUser } from "../../types/orf";

export type DraftMention = {
  end: number;
  label: string;
  start: number;
  userId: string;
};

export type ChatDraft = {
  mentions: DraftMention[];
  text: string;
};

export type UnreadAnchor = {
  channelId: string;
  lastReadAt?: string | null;
  manuallyUnread: boolean;
  mentionCount: number;
  threadUnreadCount: number;
  unreadCount: number;
};

export type ChatFeedSnapshot = {
  hasNewerMessages: boolean;
  hasOlderMessages: boolean;
  messages: ChatMessage[];
  scrollTop: number;
  syncedAt?: string;
};

export const chatMessagePageSize = 80;
export const emptyDraft: ChatDraft = { mentions: [], text: "" };

export function chatDraftStorageKey(channelId: string, rootMessageId?: string | null) {
  return `orf.chat.draft.${channelId}.${rootMessageId ?? "root"}`;
}

export function hasStoredDraftForChannel(channelId: string) {
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

export function storedDraftChannelIds(channels: ChatChannel[]) {
  return new Set(channels.filter((channel) => hasStoredDraftForChannel(channel.id)).map((channel) => channel.id));
}

export function parseStoredDraft(raw: string | null): ChatDraft {
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

export function currentMembership(channel: ChatChannel | null, userId: string | undefined) {
  return channel?.members.find((member) => member.userId === userId) ?? null;
}

export function sortChannels(channels: ChatChannel[], currentUserId?: string) {
  return [...channels].sort((left, right) => {
    const leftMember = currentMembership(left, currentUserId);
    const rightMember = currentMembership(right, currentUserId);
    if (Boolean(leftMember?.favorite) !== Boolean(rightMember?.favorite)) return leftMember?.favorite ? -1 : 1;
    return (right.lastMessageAt ?? right.updatedAt).localeCompare(left.lastMessageAt ?? left.updatedAt);
  });
}

export function upsertChannel(channels: ChatChannel[], next: ChatChannel, currentUserId?: string) {
  const found = channels.some((channel) => channel.id === next.id);
  return sortChannels(found ? channels.map((channel) => (channel.id === next.id ? next : channel)) : [next, ...channels], currentUserId);
}

export function isUnreadChannel(channel: ChatChannel, currentUserId?: string) {
  const membership = currentMembership(channel, currentUserId);
  return channel.unreadCount > 0 || channel.mentionCount > 0 || channel.threadUnreadCount > 0 || Boolean(membership?.manuallyUnread);
}

export function sortUnreadChannels(channels: ChatChannel[]) {
  return [...channels].sort((left, right) => {
    if (Boolean(left.mentionCount) !== Boolean(right.mentionCount)) return left.mentionCount ? -1 : 1;
    const leftUnread = left.unreadCount + left.threadUnreadCount;
    const rightUnread = right.unreadCount + right.threadUnreadCount;
    if (leftUnread !== rightUnread) return rightUnread - leftUnread;
    return (right.lastMessageAt ?? right.updatedAt).localeCompare(left.lastMessageAt ?? left.updatedAt);
  });
}

export function upsertMessage(messages: ChatMessage[], next: ChatMessage) {
  const found = messages.some((message) => message.id === next.id);
  const updated = found ? messages.map((message) => (message.id === next.id ? next : message)) : [...messages, next];
  return updated.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

export function upsertChannelMessage(messages: ChatMessage[], next: ChatMessage) {
  return !next.rootMessageId || messages.some((message) => message.id === next.id) ? upsertMessage(messages, next) : messages;
}

export function createFeedSnapshot(input?: Partial<ChatFeedSnapshot>): ChatFeedSnapshot {
  return {
    hasNewerMessages: input?.hasNewerMessages ?? false,
    hasOlderMessages: input?.hasOlderMessages ?? false,
    messages: input?.messages ?? [],
    scrollTop: input?.scrollTop ?? 0,
    syncedAt: input?.syncedAt,
  };
}

export function replaceFeedMessages(
  snapshot: ChatFeedSnapshot | undefined,
  messages: ChatMessage[],
  pageSize = chatMessagePageSize,
  flags?: Partial<Pick<ChatFeedSnapshot, "hasNewerMessages" | "hasOlderMessages">>,
) {
  return createFeedSnapshot({
    hasNewerMessages: flags?.hasNewerMessages ?? false,
    hasOlderMessages: flags?.hasOlderMessages ?? messages.length >= pageSize,
    messages,
    scrollTop: snapshot?.scrollTop ?? 0,
    syncedAt: new Date().toISOString(),
  });
}

export function applyFeedMessage(snapshot: ChatFeedSnapshot | undefined, message: ChatMessage) {
  if (!snapshot && message.rootMessageId) return undefined;
  const current = snapshot ?? createFeedSnapshot({ messages: [] });
  const messageExists = current.messages.some((item) => item.id === message.id);
  if (!messageExists && (message.rootMessageId || current.hasNewerMessages)) return current;
  const messages = upsertChannelMessage(current.messages, message);
  return messages === current.messages ? current : { ...current, messages };
}

export function prependOlderFeedMessages(snapshot: ChatFeedSnapshot | undefined, olderMessages: ChatMessage[], pageSize = chatMessagePageSize) {
  const current = snapshot ?? createFeedSnapshot();
  const byId = new Map<string, ChatMessage>();
  for (const message of [...olderMessages, ...current.messages]) byId.set(message.id, message);
  return {
    ...current,
    hasOlderMessages: olderMessages.length >= pageSize,
    messages: Array.from(byId.values()).sort((left, right) => left.createdAt.localeCompare(right.createdAt)),
  };
}

export function rememberFeedScroll(snapshot: ChatFeedSnapshot | undefined, scrollTop: number) {
  return createFeedSnapshot({
    ...snapshot,
    scrollTop: Math.max(0, scrollTop),
  });
}

export function buildUnreadAnchor(channel: ChatChannel, currentUserId?: string): UnreadAnchor | null {
  const member = currentMembership(channel, currentUserId);
  const hasUnreadState =
    channel.unreadCount > 0 ||
    channel.mentionCount > 0 ||
    channel.threadUnreadCount > 0 ||
    Boolean(member?.manuallyUnread);
  return hasUnreadState ? {
    channelId: channel.id,
    lastReadAt: member?.lastReadAt ?? null,
    manuallyUnread: Boolean(member?.manuallyUnread),
    mentionCount: channel.mentionCount,
    threadUnreadCount: channel.threadUnreadCount,
    unreadCount: channel.unreadCount,
  } : null;
}

export function shouldFollowIncomingMessage(message: ChatMessage, currentUserId: string | undefined, nearLatest: boolean) {
  return !message.rootMessageId && (message.authorUserId === currentUserId || nearLatest);
}

export function applyThreadSummaryMessage(
  summaries: ChatThreadSummary[],
  message: ChatMessage,
  currentUserId: string | undefined,
  activeRootMessageId?: string | null,
) {
  return summaries.map((summary) => {
    if (summary.rootMessage.id === message.id) return { ...summary, rootMessage: message };
    if (summary.rootMessage.id !== message.rootMessageId) return summary;
    const alreadyViewingThread = activeRootMessageId === summary.rootMessage.id;
    const fromCurrentUser = message.authorUserId === currentUserId;
    const isNewerReply = !summary.rootMessage.lastReplyAt || summary.rootMessage.lastReplyAt < message.createdAt;
    const lastReplyAt = isNewerReply ? message.createdAt : summary.rootMessage.lastReplyAt;
    return {
      ...summary,
      rootMessage: {
        ...summary.rootMessage,
        lastReplyAt,
        replyCount: isNewerReply ? summary.rootMessage.replyCount + 1 : summary.rootMessage.replyCount,
      },
      unreadCount: isNewerReply && !fromCurrentUser && !alreadyViewingThread ? summary.unreadCount + 1 : summary.unreadCount,
    };
  });
}

export function mentionLabel(value: string) {
  return value.replace(/[()[\]\n]/g, "").trim() || "成员";
}

export function mentionToken(mention: Pick<DraftMention, "label" | "userId">) {
  return `@[${mentionLabel(mention.label)}](orf-user:${encodeURIComponent(mention.userId)})`;
}

export function serializeDraft(draft: ChatDraft) {
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

export function draftFromStoredBody(body: string, usersById: Map<string, ChatUser>): ChatDraft {
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

export function mentionRangeFor(value: string, cursor: number, mentions: DraftMention[]) {
  if (mentions.some((mention) => cursor > mention.start && cursor <= mention.end)) return null;
  const prefix = value.slice(0, cursor);
  const match = /(^|\s)@([^\s@]{0,32})$/.exec(prefix);
  if (!match || match.index === undefined) return null;
  const atIndex = prefix.lastIndexOf("@");
  return { start: atIndex, end: cursor, query: match[2] ?? "" };
}

export function reconcileMentions(previousText: string, nextText: string, mentions: DraftMention[]) {
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
