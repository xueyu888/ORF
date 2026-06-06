import type { ChatAttachment, ChatChannel, ChatMessage, ChatThreadSummary, ChatUser } from "../../types/orf";

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

export type ChatSendInput = {
  attachments: ChatAttachment[];
  channelId: string;
  draft: ChatDraft;
  parentMessageId?: string | null;
  rootMessageId?: string | null;
};

export type ChatSendHandler = (input: ChatSendInput) => Promise<void>;
export type ChatMessageDeliveryStatus = "failed" | "sending";
export type ChatPendingSendPayload = {
  attachmentIds: string[];
  body: string;
  channelId: string;
  parentMessageId?: string | null;
  rootMessageId?: string | null;
};
export type ChatOptimisticMessage = ChatMessage & {
  deliveryError?: string;
  deliveryStatus?: ChatMessageDeliveryStatus;
  pendingSend?: ChatPendingSendPayload;
};

export type UnreadAnchor = {
  channelId: string;
  lastReadAt?: string | null;
  lastReadMessageId?: string | null;
  manuallyUnread: boolean;
  mentionCount: number;
  threadUnreadCount: number;
  unreadCount: number;
};

export type ChatUnreadJumpTarget = {
  contextRequired: boolean;
  messageId?: string | null;
};

export type ChatFeedSnapshot = {
  hasNewerMessages: boolean;
  hasOlderMessages: boolean;
  hasScrollPosition: boolean;
  messages: ChatMessage[];
  scrollTop: number;
  syncedAt?: string;
};

export const chatMessagePageSize = 80;
export const chatFeedWindowMessageLimit = chatMessagePageSize * 4;
export const chatFeedFreshSnapshotMs = 5_000;
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

export function selectChatFeedPrefetchChannelIds({
  activeChannelId,
  channels,
  currentUserId,
  limit = 8,
}: {
  activeChannelId?: string | null;
  channels: ChatChannel[];
  currentUserId?: string;
  limit?: number;
}) {
  return [...channels]
    .sort((left, right) => {
      if (Boolean(activeChannelId && left.id === activeChannelId) !== Boolean(activeChannelId && right.id === activeChannelId)) {
        return left.id === activeChannelId ? -1 : 1;
      }
      if (isUnreadChannel(left, currentUserId) !== isUnreadChannel(right, currentUserId)) {
        return isUnreadChannel(left, currentUserId) ? -1 : 1;
      }
      const leftFavorite = Boolean(currentMembership(left, currentUserId)?.favorite);
      const rightFavorite = Boolean(currentMembership(right, currentUserId)?.favorite);
      if (leftFavorite !== rightFavorite) return leftFavorite ? -1 : 1;
      if ((left.type === "direct" || left.type === "group") !== (right.type === "direct" || right.type === "group")) {
        return left.type === "direct" || left.type === "group" ? -1 : 1;
      }
      return (right.lastMessageAt ?? right.updatedAt).localeCompare(left.lastMessageAt ?? left.updatedAt);
    })
    .slice(0, Math.max(0, limit))
    .map((channel) => channel.id);
}

export function upsertMessage(messages: ChatMessage[], next: ChatMessage) {
  const found = messages.some((message) => message.id === next.id);
  const updated = found ? messages.map((message) => (message.id === next.id ? next : message)) : [...messages, next];
  return updated.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

export function chatMessageDeliveryStatus(message: ChatMessage): ChatMessageDeliveryStatus | null {
  return (message as ChatOptimisticMessage).deliveryStatus ?? null;
}

export function chatMessagePendingSend(message: ChatMessage): ChatPendingSendPayload | null {
  return (message as ChatOptimisticMessage).pendingSend ?? null;
}

export function createPendingChatMessage(input: {
  attachments: ChatAttachment[];
  author: ChatUser;
  body: string;
  channelId: string;
  parentMessageId?: string | null;
  pendingSend: ChatPendingSendPayload;
  rootMessageId?: string | null;
}): ChatOptimisticMessage {
  const createdAt = new Date().toISOString();
  const randomId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return {
    id: `pending-${randomId}`,
    channelId: input.channelId,
    authorUserId: input.author.id,
    authorName: input.author.name,
    authorAvatarUrl: input.author.avatarUrl,
    body: input.body,
    rootMessageId: input.rootMessageId ?? null,
    parentMessageId: input.parentMessageId ?? null,
    createdAt,
    updatedAt: createdAt,
    editedAt: null,
    deletedAt: null,
    deletedBy: null,
    pinnedAt: null,
    pinnedBy: null,
    replyCount: 0,
    lastReplyAt: null,
    savedByCurrentUser: false,
    attachments: input.attachments,
    reactions: [],
    deliveryStatus: "sending",
    pendingSend: input.pendingSend,
  };
}

export function markPendingChatMessageSending(message: ChatMessage): ChatOptimisticMessage {
  return {
    ...(message as ChatOptimisticMessage),
    deliveryError: undefined,
    deliveryStatus: "sending",
  };
}

export function markPendingChatMessageFailed(message: ChatMessage, error: string): ChatOptimisticMessage {
  return {
    ...(message as ChatOptimisticMessage),
    deliveryError: error,
    deliveryStatus: "failed",
  };
}

export function pendingChatMessageMatchesServerMessage(pendingMessage: ChatMessage, serverMessage: ChatMessage) {
  const pending = pendingMessage as ChatOptimisticMessage;
  if (!pending.deliveryStatus || !pending.pendingSend) return false;
  const pendingAttachmentIds = [...pending.pendingSend.attachmentIds].sort();
  const serverAttachmentIds = serverMessage.attachments.map((attachment) => attachment.id).sort();
  return (
    pendingMessage.authorUserId === serverMessage.authorUserId &&
    pendingMessage.channelId === serverMessage.channelId &&
    pending.pendingSend.body === serverMessage.body &&
    (pending.pendingSend.rootMessageId ?? null) === (serverMessage.rootMessageId ?? null) &&
    (pending.pendingSend.parentMessageId ?? null) === (serverMessage.parentMessageId ?? null) &&
    pendingAttachmentIds.length === serverAttachmentIds.length &&
    pendingAttachmentIds.every((attachmentId, index) => attachmentId === serverAttachmentIds[index])
  );
}

export function findMatchingPendingChatMessage(messages: ChatMessage[], serverMessage: ChatMessage) {
  return messages.find((message) => pendingChatMessageMatchesServerMessage(message, serverMessage)) ?? null;
}

export function removeMessageById(messages: ChatMessage[], messageId: string) {
  return messages.filter((message) => message.id !== messageId);
}

export function replacePendingMessage(messages: ChatMessage[], pendingMessageId: string, message: ChatMessage) {
  return upsertMessage(removeMessageById(messages, pendingMessageId), message);
}

export function updatePendingMessageDelivery(
  messages: ChatMessage[],
  pendingMessageId: string,
  updater: (message: ChatMessage) => ChatMessage,
) {
  return messages.map((message) => (message.id === pendingMessageId ? updater(message) : message));
}

export function upsertChannelMessage(messages: ChatMessage[], next: ChatMessage) {
  return !next.rootMessageId || messages.some((message) => message.id === next.id) ? upsertMessage(messages, next) : messages;
}

export function applyThreadReplyToRootMessage(messages: ChatMessage[], reply: ChatMessage) {
  if (!reply.rootMessageId || reply.deletedAt) return messages;
  let changed = false;
  const nextMessages = messages.map((message) => {
    if (message.id !== reply.rootMessageId) return message;
    const isNewerReply = !message.lastReplyAt || message.lastReplyAt < reply.createdAt;
    if (!isNewerReply) return message;
    changed = true;
    return {
      ...message,
      lastReplyAt: reply.createdAt,
      replyCount: message.replyCount + 1,
    };
  });
  return changed ? nextMessages : messages;
}

function trimFeedWindow(messages: ChatMessage[], direction: "older" | "newer", limit = chatFeedWindowMessageLimit) {
  if (messages.length <= limit) {
    return { droppedNewer: false, droppedOlder: false, messages };
  }

  if (direction === "older") {
    return {
      droppedNewer: true,
      droppedOlder: false,
      messages: messages.slice(0, limit),
    };
  }

  return {
    droppedNewer: false,
    droppedOlder: true,
    messages: messages.slice(-limit),
  };
}

export function createFeedSnapshot(input?: Partial<ChatFeedSnapshot>): ChatFeedSnapshot {
  return {
    hasNewerMessages: input?.hasNewerMessages ?? false,
    hasOlderMessages: input?.hasOlderMessages ?? false,
    hasScrollPosition: input?.hasScrollPosition ?? false,
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
    hasScrollPosition: snapshot?.hasScrollPosition ?? false,
    messages,
    scrollTop: snapshot?.scrollTop ?? 0,
    syncedAt: new Date().toISOString(),
  });
}

export function isFreshFeedSnapshot(snapshot: ChatFeedSnapshot | undefined, now = Date.now()) {
  if (!snapshot?.syncedAt) return false;
  const syncedAt = Date.parse(snapshot.syncedAt);
  return Number.isFinite(syncedAt) && now - syncedAt <= chatFeedFreshSnapshotMs;
}

export function applyFeedMessage(snapshot: ChatFeedSnapshot | undefined, message: ChatMessage) {
  if (!snapshot && message.rootMessageId) return undefined;
  const current = snapshot ?? createFeedSnapshot({ messages: [] });
  if (message.rootMessageId) {
    const messages = applyThreadReplyToRootMessage(current.messages, message);
    return messages === current.messages ? current : { ...current, messages };
  }
  const messageExists = current.messages.some((item) => item.id === message.id);
  if (!messageExists && current.hasNewerMessages) return current;
  const messages = upsertChannelMessage(current.messages, message);
  if (messages === current.messages) return current;
  const trimmed = trimFeedWindow(messages, "newer");
  return {
    ...current,
    hasOlderMessages: current.hasOlderMessages || trimmed.droppedOlder,
    messages: trimmed.messages,
  };
}

export function optimisticToggleChatReaction(message: ChatMessage, emojiName: string, currentUserId?: string): ChatMessage {
  const currentReaction = message.reactions.find((reaction) => reaction.emojiName === emojiName);
  const reacting = !currentReaction?.reactedByCurrentUser;
  if (!currentReaction) {
    return {
      ...message,
      reactions: [
        ...message.reactions,
        {
          emojiName,
          count: 1,
          reactedByCurrentUser: true,
          userIds: currentUserId ? [currentUserId] : [],
        },
      ],
    };
  }

  const nextCount = Math.max(0, currentReaction.count + (reacting ? 1 : -1));
  return {
    ...message,
    reactions: message.reactions.flatMap((reaction) => {
      if (reaction.emojiName !== emojiName) return [reaction];
      if (nextCount === 0) return [];
      const userIds = currentUserId
        ? reacting
          ? Array.from(new Set([...reaction.userIds, currentUserId]))
          : reaction.userIds.filter((userId) => userId !== currentUserId)
        : reaction.userIds;
      return [{
        ...reaction,
        count: nextCount,
        reactedByCurrentUser: reacting,
        userIds,
      }];
    }),
  };
}

export function optimisticSetChatMessagePinned(message: ChatMessage, pinned: boolean, currentUserId?: string): ChatMessage {
  const now = new Date().toISOString();
  return {
    ...message,
    pinnedAt: pinned ? message.pinnedAt ?? now : null,
    pinnedBy: pinned ? message.pinnedBy ?? currentUserId ?? null : null,
  };
}

export function optimisticSetChatMessageSaved(message: ChatMessage, saved: boolean): ChatMessage {
  return {
    ...message,
    savedByCurrentUser: saved,
  };
}

export function prependOlderFeedMessages(snapshot: ChatFeedSnapshot | undefined, olderMessages: ChatMessage[], pageSize = chatMessagePageSize) {
  const current = snapshot ?? createFeedSnapshot();
  const byId = new Map<string, ChatMessage>();
  for (const message of [...olderMessages, ...current.messages]) byId.set(message.id, message);
  const trimmed = trimFeedWindow(
    Array.from(byId.values()).sort((left, right) => left.createdAt.localeCompare(right.createdAt)),
    "older",
  );
  return {
    ...current,
    hasOlderMessages: olderMessages.length >= pageSize,
    hasNewerMessages: current.hasNewerMessages || trimmed.droppedNewer,
    messages: trimmed.messages,
  };
}

export function rememberFeedScroll(snapshot: ChatFeedSnapshot | undefined, scrollTop: number) {
  return createFeedSnapshot({
    ...snapshot,
    hasScrollPosition: true,
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
    lastReadMessageId: member?.lastReadMessageId ?? null,
    manuallyUnread: Boolean(member?.manuallyUnread),
    mentionCount: channel.mentionCount,
    threadUnreadCount: channel.threadUnreadCount,
    unreadCount: channel.unreadCount,
  } : null;
}

export function hasMainFeedUnread(unreadAnchor: UnreadAnchor | null): unreadAnchor is UnreadAnchor {
  return Boolean(
    unreadAnchor &&
    (unreadAnchor.unreadCount > 0 || unreadAnchor.mentionCount > 0 || unreadAnchor.manuallyUnread),
  );
}

export function resolveUnreadJumpTarget(input: {
  currentUserId?: string;
  hasOlderMessages: boolean;
  messages: ChatMessage[];
  unreadAnchor: UnreadAnchor | null;
}): { dividerIndex: number; jumpTarget: ChatUnreadJumpTarget; messageId: string | null } | null {
  const { currentUserId, hasOlderMessages, messages, unreadAnchor } = input;
  if (!hasMainFeedUnread(unreadAnchor) || messages.length === 0) return null;

  const firstUnreadIndex = messages.findIndex((message) => {
    if (message.deletedAt) return false;
    if (unreadAnchor.lastReadAt && message.createdAt <= unreadAnchor.lastReadAt) return false;
    return message.authorUserId !== currentUserId || unreadAnchor.manuallyUnread;
  });

  if (firstUnreadIndex < 0) {
    return { dividerIndex: -1, jumpTarget: { contextRequired: true }, messageId: null };
  }

  const message = messages[firstUnreadIndex];
  const boundaryMayBeOlder =
    hasOlderMessages &&
    firstUnreadIndex === 0 &&
    (!unreadAnchor.lastReadAt || message.createdAt > unreadAnchor.lastReadAt);

  if (boundaryMayBeOlder) {
    return { dividerIndex: -1, jumpTarget: { contextRequired: true }, messageId: null };
  }

  return {
    dividerIndex: firstUnreadIndex,
    jumpTarget: { contextRequired: false, messageId: message.id },
    messageId: message.id,
  };
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
