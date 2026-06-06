import type { Readable } from "node:stream";
import type {
  ChatAttachment,
  ChatBootstrap,
  ChatChannel,
  ChatChannelMember,
  ChatChannelType,
  ChatMessageContext,
  ChatMessage,
  ChatReaction,
  ChatSearchResult,
  ChatThread,
  ChatThreadSummary,
  ChatUser,
} from "../../src/types/orf";
import { addDaysToIsoDate, hasExecutableChatSearch, parseChatSearchQuery } from "../../src/features/chat/chatSearchSyntax";
import { pool } from "../db/client";
import { env } from "../env";
import { publishRealtimeChatEvent } from "../realtime/realtimeEventBus";
import { objectStorage } from "../storage/objectStorage";
import { avatarUrlForUser } from "../users/avatar/avatarRepository";
import { createNotifications } from "./notificationRepository";
import {
  CHAT_ATTACHMENT_TTL_MS,
  DEFAULT_PUBLIC_CHANNEL_DISPLAY_NAME,
  DEFAULT_PUBLIC_CHANNEL_NAME,
  type AttachmentRow,
  type ChannelMemberRow,
  type ChannelRow,
  type ChatActor,
  type MessageCollectionRow,
  type MessageRow,
  type Outcome,
  type ReactionRow,
  type UserRow,
  chatAttachmentContentUrl,
  displayNameForChannel,
  extractMentionUserIds,
  iso,
  makeChatAttachmentId,
  makeId,
  normalizeChannelName,
  normalizeMimeType,
  nowIso,
  ok,
  previewText,
  safePathSegment,
  stableConversationName,
  storageTeamId,
  toChannelMember,
  toChatAttachment,
  toChatUser,
} from "./chatRepositoryModel";

export type { ChatActor } from "./chatRepositoryModel";

async function ensureDefaultPublicChannel(teamId: string) {
  const now = nowIso();
  await pool.query(
    `
      INSERT INTO chat_channels (id, team_id, type, name, display_name, purpose, header, created_by, created_at, updated_at)
      VALUES ($1, $2, 'public', $3, $4, '默认全员沟通频道', '', null, $5, $5)
      ON CONFLICT (team_id, name) DO NOTHING
    `,
    [makeId("chat-channel"), teamId, DEFAULT_PUBLIC_CHANNEL_NAME, DEFAULT_PUBLIC_CHANNEL_DISPLAY_NAME, now],
  );
}

async function ensurePublicChannelMemberships(teamId: string) {
  const now = nowIso();
  await pool.query(
    `
      INSERT INTO chat_channel_members (channel_id, user_id, role, favorite, muted, manually_unread, joined_at)
      SELECT c.id, u.id, 'member', false, false, false, $2
      FROM chat_channels c
      INNER JOIN team_members tm ON tm.team_id = c.team_id
      INNER JOIN users u ON u.id = tm.user_id AND COALESCE(u.status, 'active') = 'active'
      WHERE c.team_id = $1
        AND c.type = 'public'
        AND c.archived_at IS NULL
        AND NOT EXISTS (
          SELECT 1
          FROM chat_import_mappings im
          WHERE im.team_id = c.team_id
            AND im.target_table = 'chat_channels'
            AND im.target_id = c.id
        )
      ON CONFLICT (channel_id, user_id) DO NOTHING
    `,
    [teamId, now],
  );
}

async function preparePublicChannels(teamId: string) {
  await ensureDefaultPublicChannel(teamId);
  await ensurePublicChannelMemberships(teamId);
}

async function listActiveTeamUsers(teamId: string) {
  const { rows } = await pool.query<UserRow>(
    `
      SELECT u.id, u.name, u.email, u.status, u.last_online_at, u.avatar_object_key, u.avatar_updated_at, tm.role
      FROM team_members tm
      INNER JOIN users u ON u.id = tm.user_id
      WHERE tm.team_id = $1
        AND COALESCE(u.status, 'active') = 'active'
      ORDER BY lower(u.name), u.name
    `,
    [teamId],
  );
  return rows.map(toChatUser);
}

async function listVisibleChannelRows(actor: ChatActor) {
  const teamId = storageTeamId(actor);
  await preparePublicChannels(teamId);
  const { rows } = await pool.query<ChannelRow>(
    `
      SELECT c.id, c.team_id, c.type, c.name, c.display_name, c.purpose, c.header, c.created_by, c.archived_by, c.created_at, c.updated_at, c.archived_at
      FROM chat_channels c
      INNER JOIN chat_channel_members m ON m.channel_id = c.id AND m.user_id = $2
      WHERE c.team_id = $1
        AND c.archived_at IS NULL
      ORDER BY m.favorite DESC, c.type, c.updated_at DESC, lower(c.display_name)
    `,
    [teamId, actor.id],
  );
  return rows;
}

async function loadMembers(channelIds: string[]) {
  if (channelIds.length === 0) return new Map<string, ChatChannelMember[]>();
  const { rows } = await pool.query<ChannelMemberRow>(
    `
      SELECT channel_id, user_id, role, favorite, muted, manually_unread, last_viewed_at, last_read_at, last_read_message_id, joined_at
      FROM chat_channel_members
      WHERE channel_id = ANY($1::text[])
      ORDER BY joined_at ASC
    `,
    [channelIds],
  );
  const grouped = new Map<string, ChatChannelMember[]>();
  for (const row of rows) {
    const items = grouped.get(row.channel_id) ?? [];
    items.push(toChannelMember(row));
    grouped.set(row.channel_id, items);
  }
  return grouped;
}

async function loadUsersByIds(userIds: string[]) {
  const uniqueIds = Array.from(new Set(userIds.filter(Boolean)));
  if (uniqueIds.length === 0) return new Map<string, ChatUser>();
  const { rows } = await pool.query<UserRow>(
    `
      SELECT u.id, u.name, u.email, u.status, u.last_online_at, u.avatar_object_key, u.avatar_updated_at, COALESCE(tm.role, 'member') AS role
      FROM users u
      LEFT JOIN team_members tm ON tm.user_id = u.id
      WHERE u.id = ANY($1::uuid[])
    `,
    [uniqueIds],
  );
  return new Map(rows.map((row) => [row.id, toChatUser(row)]));
}

async function loadChannelReadModel(channelIds: string[], actor: ChatActor) {
  const empty = {
    lastMessageAt: new Map<string, string | null>(),
    lastMessagePreview: new Map<string, string | null>(),
    mentionCounts: new Map<string, number>(),
    threadUnreadCounts: new Map<string, number>(),
    unreadCounts: new Map<string, number>(),
  };
  if (channelIds.length === 0) return empty;

  const [lastMessages, unreadCounts, mentionCounts, threadUnreadCounts] = await Promise.all([
    pool.query<{ body: string; channel_id: string; created_at: Date | string }>(
      `
        SELECT DISTINCT ON (channel_id) channel_id, body, created_at
        FROM chat_messages
        WHERE channel_id = ANY($1::text[])
          AND deleted_at IS NULL
        ORDER BY channel_id, created_at DESC
      `,
      [channelIds],
    ),
    pool.query<{ channel_id: string; count: number }>(
      `
        SELECT m.channel_id, count(*)::int AS count
        FROM chat_messages m
        INNER JOIN chat_channel_members cm ON cm.channel_id = m.channel_id AND cm.user_id = $2
        WHERE m.channel_id = ANY($1::text[])
          AND m.author_user_id <> $2
          AND m.deleted_at IS NULL
          AND m.root_message_id IS NULL
          AND (cm.last_read_at IS NULL OR m.created_at > cm.last_read_at)
        GROUP BY m.channel_id
      `,
      [channelIds, actor.id],
    ),
    pool.query<{ channel_id: string; count: number }>(
      `
        SELECT m.channel_id, count(*)::int AS count
        FROM chat_messages m
        INNER JOIN chat_channel_members cm ON cm.channel_id = m.channel_id AND cm.user_id = $2
        WHERE m.channel_id = ANY($1::text[])
          AND m.author_user_id <> $2
          AND m.deleted_at IS NULL
          AND m.root_message_id IS NULL
          AND m.body LIKE $3
          AND (cm.last_read_at IS NULL OR m.created_at > cm.last_read_at)
        GROUP BY m.channel_id
      `,
      [channelIds, actor.id, `%orf-user:${actor.id}%`],
    ),
    pool.query<{ channel_id: string; count: number }>(
      `
        SELECT m.channel_id, count(DISTINCT m.root_message_id)::int AS count
        FROM chat_messages m
        INNER JOIN chat_thread_follows f ON f.root_message_id = m.root_message_id AND f.user_id = $2 AND f.following = true
        WHERE m.channel_id = ANY($1::text[])
          AND m.root_message_id IS NOT NULL
          AND m.author_user_id <> $2
          AND m.deleted_at IS NULL
          AND (f.last_viewed_at IS NULL OR m.created_at > f.last_viewed_at)
        GROUP BY m.channel_id
      `,
      [channelIds, actor.id],
    ),
  ]);

  for (const row of lastMessages.rows) {
    empty.lastMessageAt.set(row.channel_id, iso(row.created_at));
    empty.lastMessagePreview.set(row.channel_id, previewText(row.body));
  }
  for (const row of unreadCounts.rows) empty.unreadCounts.set(row.channel_id, Number(row.count));
  for (const row of mentionCounts.rows) empty.mentionCounts.set(row.channel_id, Number(row.count));
  for (const row of threadUnreadCounts.rows) empty.threadUnreadCounts.set(row.channel_id, Number(row.count));
  return empty;
}

async function buildChannels(rows: ChannelRow[], actor: ChatActor): Promise<ChatChannel[]> {
  const channelIds = rows.map((row) => row.id);
  const membersByChannel = await loadMembers(channelIds);
  const allMemberIds = Array.from(new Set(Array.from(membersByChannel.values()).flat().map((member) => member.userId)));
  const [usersById, readModel] = await Promise.all([
    loadUsersByIds(allMemberIds),
    loadChannelReadModel(channelIds, actor),
  ]);

  return rows.map((row) => {
    const members = membersByChannel.get(row.id) ?? [];
    const currentMember = members.find((member) => member.userId === actor.id);
    const unreadCount = readModel.unreadCounts.get(row.id) ?? 0;
    return {
      id: row.id,
      type: row.type,
      name: row.name,
      displayName: displayNameForChannel(row, members, usersById, actor),
      purpose: row.purpose,
      header: row.header,
      createdBy: row.created_by,
      createdAt: iso(row.created_at) ?? nowIso(),
      updatedAt: iso(row.updated_at) ?? nowIso(),
      archivedAt: iso(row.archived_at),
      memberCount: members.length,
      members,
      unreadCount: currentMember?.manuallyUnread && unreadCount === 0 ? 1 : unreadCount,
      mentionCount: readModel.mentionCounts.get(row.id) ?? 0,
      threadUnreadCount: readModel.threadUnreadCounts.get(row.id) ?? 0,
      lastMessageAt: readModel.lastMessageAt.get(row.id) ?? null,
      lastMessagePreview: readModel.lastMessagePreview.get(row.id) ?? null,
    };
  });
}

async function getVisibleChannel(actor: ChatActor, channelId: string): Promise<ChatChannel | null> {
  const teamId = storageTeamId(actor);
  await preparePublicChannels(teamId);
  const { rows } = await pool.query<ChannelRow>(
    `
      SELECT c.id, c.team_id, c.type, c.name, c.display_name, c.purpose, c.header, c.created_by, c.archived_by, c.created_at, c.updated_at, c.archived_at
      FROM chat_channels c
      INNER JOIN chat_channel_members m ON m.channel_id = c.id AND m.user_id = $3
      WHERE c.team_id = $1
        AND c.id = $2
        AND c.archived_at IS NULL
      LIMIT 1
    `,
    [teamId, channelId, actor.id],
  );
  const [channel] = await buildChannels(rows, actor);
  return channel ?? null;
}

async function getChannelRow(actor: ChatActor, channelId: string) {
  const teamId = storageTeamId(actor);
  const { rows } = await pool.query<ChannelRow>(
    `
      SELECT id, team_id, type, name, display_name, purpose, header, created_by, archived_by, created_at, updated_at, archived_at
      FROM chat_channels
      WHERE team_id = $1 AND id = $2
      LIMIT 1
    `,
    [teamId, channelId],
  );
  return rows[0] ?? null;
}

async function getChannelMember(channelId: string, userId: string) {
  const { rows } = await pool.query<ChannelMemberRow>(
    `
      SELECT channel_id, user_id, role, favorite, muted, manually_unread, last_viewed_at, last_read_at, last_read_message_id, joined_at
      FROM chat_channel_members
      WHERE channel_id = $1 AND user_id = $2
      LIMIT 1
    `,
    [channelId, userId],
  );
  return rows[0] ? toChannelMember(rows[0]) : null;
}

async function canManageChannel(actor: ChatActor, channelId: string) {
  if (actor.canManageAnyChannel || actor.canManageAnyMembers) return true;
  const member = await getChannelMember(channelId, actor.id);
  return member?.role === "owner" || member?.role === "admin";
}

async function getChannelRecipientIds(teamId: string, channelId: string) {
  const { rows } = await pool.query<{ user_id: string }>(
    `
      SELECT m.user_id
      FROM chat_channel_members m
      INNER JOIN users u ON u.id = m.user_id AND COALESCE(u.status, 'active') = 'active'
      INNER JOIN chat_channels c ON c.id = m.channel_id AND c.team_id = $1
      WHERE m.channel_id = $2
    `,
    [teamId, channelId],
  );
  return rows.map((row) => row.user_id);
}

async function getMentionableRecipientIds(teamId: string, channelId: string, mentionedUserIds: string[]) {
  const uniqueMentioned = Array.from(new Set(mentionedUserIds.filter(Boolean)));
  if (uniqueMentioned.length === 0) return [];
  const { rows } = await pool.query<{ user_id: string }>(
    `
      SELECT m.user_id
      FROM chat_channel_members m
      INNER JOIN users u ON u.id = m.user_id AND COALESCE(u.status, 'active') = 'active'
      INNER JOIN chat_channels c ON c.id = m.channel_id AND c.team_id = $1
      WHERE m.channel_id = $2
        AND m.user_id = ANY($3::uuid[])
    `,
    [teamId, channelId, uniqueMentioned],
  );
  return rows.map((row) => row.user_id);
}

async function getThreadFollowerNotificationRecipients(teamId: string, rootMessageId: string, actorUserId: string, excludedUserIds: string[]) {
  const excluded = Array.from(new Set([actorUserId, ...excludedUserIds].filter(Boolean)));
  const { rows } = await pool.query<{ user_id: string }>(
    `
      SELECT f.user_id
      FROM chat_thread_follows f
      INNER JOIN chat_messages root ON root.id = f.root_message_id AND root.team_id = $1
      INNER JOIN users u ON u.id = f.user_id AND COALESCE(u.status, 'active') = 'active'
      WHERE f.root_message_id = $2
        AND f.following = true
        AND NOT (f.user_id = ANY($3::uuid[]))
    `,
    [teamId, rootMessageId, excluded.length > 0 ? excluded : [actorUserId]],
  );
  return rows.map((row) => row.user_id);
}

async function createChatNotifications(input: {
  actor: ChatActor;
  body: string;
  channel: ChatChannel;
  message: ChatMessage;
  mentionedUserIds: string[];
  recipientUserIds: string[];
  rootMessageId?: string | null;
}) {
  const teamId = storageTeamId(input.actor);
  const href = `/chat/${encodeURIComponent(input.channel.id)}?message=${encodeURIComponent(input.message.id)}`;
  const mentionedRecipients = await getMentionableRecipientIds(teamId, input.channel.id, input.mentionedUserIds);
  const directRecipients =
    input.channel.type === "direct" || input.channel.type === "group"
      ? input.recipientUserIds.filter((id) => id !== input.actor.id && !mentionedRecipients.includes(id))
      : [];
  const threadRecipients =
    input.rootMessageId && input.channel.type !== "direct" && input.channel.type !== "group"
      ? await getThreadFollowerNotificationRecipients(teamId, input.rootMessageId, input.actor.id, mentionedRecipients)
      : [];

  if (directRecipients.length > 0) {
    await createNotifications({
      actorName: input.actor.name,
      actorUserId: input.actor.id,
      body: previewText(input.body) || "发送了一条消息",
      kind: "chat.direct.created",
      metadata: { channelId: input.channel.id, messageId: input.message.id, rootMessageId: input.rootMessageId ?? "" },
      recipientUserIds: directRecipients,
      targetHref: href,
      targetId: input.channel.id,
      targetType: "chat",
      teamId,
      title: input.channel.type === "direct" ? `${input.actor.name} 发来私聊消息` : `${input.channel.displayName} 有新消息`,
    });
  }

  if (mentionedRecipients.length > 0) {
    await createNotifications({
      actorName: input.actor.name,
      actorUserId: input.actor.id,
      body: previewText(input.body) || "提到了你",
      kind: "chat.mention.created",
      metadata: { channelId: input.channel.id, messageId: input.message.id, rootMessageId: input.rootMessageId ?? "" },
      recipientUserIds: mentionedRecipients,
      targetHref: href,
      targetId: input.channel.id,
      targetType: "chat",
      teamId,
      title: `${input.actor.name} 在聊天中提到了你`,
    });
  }

  if (threadRecipients.length > 0) {
    await createNotifications({
      actorName: input.actor.name,
      actorUserId: input.actor.id,
      body: previewText(input.body) || "关注的线程有新回复",
      kind: "chat.thread.updated",
      metadata: { channelId: input.channel.id, messageId: input.message.id, rootMessageId: input.rootMessageId ?? "" },
      recipientUserIds: threadRecipients,
      targetHref: href,
      targetId: input.channel.id,
      targetType: "chat",
      teamId,
      title: "关注的聊天线程有新回复",
    });
  }
}

async function loadAttachments(messageIds: string[]) {
  if (messageIds.length === 0) return new Map<string, ChatAttachment[]>();
  const { rows } = await pool.query<AttachmentRow>(
    `
      SELECT id, message_id, object_key, file_name, mime_type, file_size, width, height, created_at
      FROM chat_attachments
      WHERE message_id = ANY($1::text[])
      ORDER BY created_at ASC
    `,
    [messageIds],
  );
  const grouped = new Map<string, ChatAttachment[]>();
  for (const row of rows) {
    if (!row.message_id) continue;
    const items = grouped.get(row.message_id) ?? [];
    items.push(toChatAttachment(row));
    grouped.set(row.message_id, items);
  }
  return grouped;
}

async function loadReactions(messageIds: string[], actor: ChatActor) {
  if (messageIds.length === 0) return new Map<string, ChatReaction[]>();
  const { rows } = await pool.query<ReactionRow>(
    `
      SELECT message_id, user_id, emoji_name
      FROM chat_message_reactions
      WHERE message_id = ANY($1::text[])
      ORDER BY emoji_name ASC, created_at ASC
    `,
    [messageIds],
  );
  const groupedByMessage = new Map<string, Map<string, ReactionRow[]>>();
  for (const row of rows) {
    const emojiMap = groupedByMessage.get(row.message_id) ?? new Map<string, ReactionRow[]>();
    const items = emojiMap.get(row.emoji_name) ?? [];
    items.push(row);
    emojiMap.set(row.emoji_name, items);
    groupedByMessage.set(row.message_id, emojiMap);
  }

  const result = new Map<string, ChatReaction[]>();
  for (const [messageId, emojiMap] of groupedByMessage) {
    result.set(
      messageId,
      Array.from(emojiMap.entries()).map(([emojiName, items]) => ({
        emojiName,
        count: items.length,
        reactedByCurrentUser: items.some((item) => item.user_id === actor.id),
        userIds: items.map((item) => item.user_id),
      })),
    );
  }
  return result;
}

async function loadReplySummaries(rootMessageIds: string[]) {
  const summaries = new Map<string, { count: number; lastReplyAt: string | null }>();
  if (rootMessageIds.length === 0) return summaries;
  const { rows } = await pool.query<{ count: number; last_reply_at: Date | string | null; root_message_id: string }>(
    `
      SELECT root_message_id, count(*)::int AS count, max(created_at) AS last_reply_at
      FROM chat_messages
      WHERE root_message_id = ANY($1::text[])
        AND deleted_at IS NULL
      GROUP BY root_message_id
    `,
    [rootMessageIds],
  );
  for (const row of rows) {
    summaries.set(row.root_message_id, { count: Number(row.count), lastReplyAt: iso(row.last_reply_at) });
  }
  return summaries;
}

async function loadMessageCollections(messageIds: string[], actor: ChatActor) {
  if (messageIds.length === 0) return new Map<string, MessageCollectionRow>();
  const { rows } = await pool.query<MessageCollectionRow>(
    `
      SELECT target.message_id,
             p.pinned_at,
             p.pinned_by,
             s.saved_at
      FROM unnest($1::text[]) AS target(message_id)
      LEFT JOIN chat_message_pins p ON p.message_id = target.message_id
      LEFT JOIN chat_message_saves s ON s.message_id = target.message_id AND s.user_id = $2
    `,
    [messageIds, actor.id],
  );
  return new Map(rows.map((row) => [row.message_id, row]));
}

async function buildMessages(rows: MessageRow[], actor: ChatActor): Promise<ChatMessage[]> {
  const messageIds = rows.map((row) => row.id);
  const rootIds = rows.filter((row) => row.root_message_id === null).map((row) => row.id);
  const [attachmentsByMessage, reactionsByMessage, replySummaries, collectionsByMessage] = await Promise.all([
    loadAttachments(messageIds),
    loadReactions(messageIds, actor),
    loadReplySummaries(rootIds),
    loadMessageCollections(messageIds, actor),
  ]);

  return rows.map((row) => {
    const deleted = Boolean(row.deleted_at);
    const replySummary = replySummaries.get(row.id);
    const collections = collectionsByMessage.get(row.id);
    return {
      id: row.id,
      channelId: row.channel_id,
      authorUserId: row.author_user_id,
      authorName: row.author_name,
      authorAvatarUrl: avatarUrlForUser({
        id: row.author_user_id,
        avatarObjectKey: row.author_avatar_object_key,
        avatarUpdatedAt: iso(row.author_avatar_updated_at),
      }),
      body: deleted ? "" : row.body,
      rootMessageId: row.root_message_id,
      parentMessageId: row.parent_message_id,
      createdAt: iso(row.created_at) ?? nowIso(),
      updatedAt: iso(row.updated_at) ?? nowIso(),
      editedAt: iso(row.edited_at),
      deletedAt: iso(row.deleted_at),
      deletedBy: row.deleted_by,
      pinnedAt: iso(collections?.pinned_at),
      pinnedBy: collections?.pinned_by ?? null,
      replyCount: replySummary?.count ?? 0,
      lastReplyAt: replySummary?.lastReplyAt ?? null,
      savedByCurrentUser: Boolean(collections?.saved_at),
      attachments: deleted ? [] : attachmentsByMessage.get(row.id) ?? [],
      reactions: deleted ? [] : reactionsByMessage.get(row.id) ?? [],
    };
  });
}

async function getMessageById(actor: ChatActor, messageId: string) {
  const teamId = storageTeamId(actor);
  const { rows } = await pool.query<MessageRow>(
    `
      SELECT m.id, m.channel_id, m.author_user_id, u.name AS author_name, u.avatar_object_key AS author_avatar_object_key,
             u.avatar_updated_at AS author_avatar_updated_at, m.body, m.root_message_id, m.parent_message_id,
             m.created_at, m.updated_at, m.edited_at, m.deleted_at, m.deleted_by
      FROM chat_messages m
      INNER JOIN users u ON u.id = m.author_user_id
      WHERE m.team_id = $1 AND m.id = $2
      LIMIT 1
    `,
    [teamId, messageId],
  );
  const [message] = await buildMessages(rows, actor);
  return message ?? null;
}

async function getRawMessage(actor: ChatActor, messageId: string) {
  const teamId = storageTeamId(actor);
  const { rows } = await pool.query<MessageRow>(
    `
      SELECT m.id, m.channel_id, m.author_user_id, u.name AS author_name, u.avatar_object_key AS author_avatar_object_key,
             u.avatar_updated_at AS author_avatar_updated_at, m.body, m.root_message_id, m.parent_message_id,
             m.created_at, m.updated_at, m.edited_at, m.deleted_at, m.deleted_by
      FROM chat_messages m
      INNER JOIN users u ON u.id = m.author_user_id
      WHERE m.team_id = $1 AND m.id = $2
      LIMIT 1
    `,
    [teamId, messageId],
  );
  return rows[0] ?? null;
}

export async function getChatBootstrap(actor: ChatActor): Promise<ChatBootstrap> {
  if (!actor.canRead) {
    return {
      channels: [],
      users: [],
      permissions: {
        canCreatePrivateChannel: actor.canCreatePrivateChannel,
        canCreatePublicChannel: actor.canCreatePublicChannel,
        canManageAnyChannel: actor.canManageAnyChannel,
        canManageAnyMembers: actor.canManageAnyMembers,
        canRead: false,
        canWrite: actor.canWrite,
      },
    };
  }

  const teamId = storageTeamId(actor);
  const [users, channelRows] = await Promise.all([listActiveTeamUsers(teamId), listVisibleChannelRows(actor)]);
  const channels = await buildChannels(channelRows, actor);
  return {
    channels,
    users,
    permissions: {
      canCreatePrivateChannel: actor.canCreatePrivateChannel,
      canCreatePublicChannel: actor.canCreatePublicChannel,
      canManageAnyChannel: actor.canManageAnyChannel,
      canManageAnyMembers: actor.canManageAnyMembers,
      canRead: actor.canRead,
      canWrite: actor.canWrite,
    },
  };
}

export async function listChatMessages(input: { before?: string; channelId: string; limit?: number }, actor: ChatActor): Promise<Outcome<{ messages: ChatMessage[] }>> {
  if (!actor.canRead) return { status: "forbidden" };
  const channel = await getVisibleChannel(actor, input.channelId);
  if (!channel) return { status: "notFound" };

  const limit = Math.max(1, Math.min(100, input.limit ?? 60));
  const params: unknown[] = [storageTeamId(actor), input.channelId, limit];
  const beforeClause = input.before ? "AND m.created_at < $4" : "";
  if (input.before) params.push(input.before);
  const { rows } = await pool.query<MessageRow>(
    `
      SELECT *
      FROM (
        SELECT m.id, m.channel_id, m.author_user_id, u.name AS author_name, u.avatar_object_key AS author_avatar_object_key,
               u.avatar_updated_at AS author_avatar_updated_at, m.body, m.root_message_id, m.parent_message_id,
               m.created_at, m.updated_at, m.edited_at, m.deleted_at, m.deleted_by
        FROM chat_messages m
        INNER JOIN users u ON u.id = m.author_user_id
        WHERE m.team_id = $1
          AND m.channel_id = $2
          AND m.root_message_id IS NULL
          ${beforeClause}
        ORDER BY m.created_at DESC
        LIMIT $3
      ) ordered_messages
      ORDER BY created_at ASC
    `,
    params,
  );
  return ok({ messages: await buildMessages(rows, actor) });
}

export async function getChatMessageContext(
  input: { channelId: string; limit?: number; messageId: string },
  actor: ChatActor,
): Promise<Outcome<ChatMessageContext>> {
  if (!actor.canRead) return { status: "forbidden" };
  const channel = await getVisibleChannel(actor, input.channelId);
  if (!channel) return { status: "notFound" };

  const target = await getRawMessage(actor, input.messageId);
  if (!target || target.channel_id !== input.channelId) return { status: "notFound" };
  const rootMessageId = target.root_message_id ?? target.id;
  const root = rootMessageId === target.id ? target : await getRawMessage(actor, rootMessageId);
  if (!root || root.channel_id !== input.channelId || root.root_message_id !== null) return { status: "notFound" };

  const limit = Math.max(3, Math.min(100, input.limit ?? 60));
  const radius = Math.max(1, Math.floor((limit - 1) / 2));
  type RankedMessageRow = MessageRow & {
    rn: number | string;
    total_count: number | string;
  };
  const { rows } = await pool.query<RankedMessageRow>(
    `
      WITH ordered_roots AS (
        SELECT m.id, m.channel_id, m.author_user_id, u.name AS author_name, u.avatar_object_key AS author_avatar_object_key,
               u.avatar_updated_at AS author_avatar_updated_at, m.body, m.root_message_id, m.parent_message_id,
               m.created_at, m.updated_at, m.edited_at, m.deleted_at, m.deleted_by,
               row_number() OVER (ORDER BY m.created_at ASC, m.id ASC) AS rn,
               count(*) OVER () AS total_count
        FROM chat_messages m
        INNER JOIN users u ON u.id = m.author_user_id
        WHERE m.team_id = $1
          AND m.channel_id = $2
          AND m.root_message_id IS NULL
      ),
      target_root AS (
        SELECT rn, total_count
        FROM ordered_roots
        WHERE id = $3
        LIMIT 1
      )
      SELECT ordered_roots.*
      FROM ordered_roots, target_root
      WHERE ordered_roots.rn BETWEEN target_root.rn - $4 AND target_root.rn + $4
      ORDER BY ordered_roots.rn ASC
    `,
    [storageTeamId(actor), input.channelId, rootMessageId, radius],
  );
  if (rows.length === 0) return { status: "notFound" };

  const ranks = rows.map((row) => Number(row.rn));
  const maxRank = Math.max(...ranks);
  const minRank = Math.min(...ranks);
  const totalCount = Number(rows[0]?.total_count ?? rows.length);
  return ok({
    hasNewerMessages: maxRank < totalCount,
    hasOlderMessages: minRank > 1,
    messages: await buildMessages(rows, actor),
    targetMessageId: rootMessageId,
  });
}

export async function getChatUnreadContext(
  input: { anchor?: { lastReadAt?: string | null; manuallyUnread: boolean }; channelId: string; limit?: number },
  actor: ChatActor,
): Promise<Outcome<ChatMessageContext>> {
  if (!actor.canRead) return { status: "forbidden" };
  const channel = await getVisibleChannel(actor, input.channelId);
  if (!channel) return { status: "notFound" };

  const member = channel.members.find((item) => item.userId === actor.id);
  const lastReadAt = input.anchor ? input.anchor.lastReadAt ?? null : member?.lastReadAt ?? null;
  const manuallyUnread = input.anchor ? input.anchor.manuallyUnread : Boolean(member?.manuallyUnread);
  const { rows } = await pool.query<{ id: string }>(
    `
      SELECT m.id
      FROM chat_messages m
      WHERE m.team_id = $1
        AND m.channel_id = $2
        AND m.root_message_id IS NULL
        AND m.deleted_at IS NULL
        AND ($3::timestamptz IS NULL OR m.created_at > $3::timestamptz)
        AND ($4::boolean = true OR m.author_user_id <> $5::uuid)
      ORDER BY m.created_at ASC, m.id ASC
      LIMIT 1
    `,
    [storageTeamId(actor), input.channelId, lastReadAt, manuallyUnread, actor.id],
  );
  const targetMessageId = rows[0]?.id;
  if (!targetMessageId) return { status: "notFound" };
  return getChatMessageContext({ channelId: input.channelId, limit: input.limit, messageId: targetMessageId }, actor);
}

export async function getChatThread(rootMessageId: string, actor: ChatActor): Promise<Outcome<{ channel: ChatChannel; thread: ChatThread }>> {
  if (!actor.canRead) return { status: "forbidden" };
  const root = await getRawMessage(actor, rootMessageId);
  if (!root || root.root_message_id !== null) return { status: "notFound" };
  const channel = await getVisibleChannel(actor, root.channel_id);
  if (!channel) return { status: "notFound" };

  const { rows } = await pool.query<MessageRow>(
    `
      SELECT m.id, m.channel_id, m.author_user_id, u.name AS author_name, u.avatar_object_key AS author_avatar_object_key,
             u.avatar_updated_at AS author_avatar_updated_at, m.body, m.root_message_id, m.parent_message_id,
             m.created_at, m.updated_at, m.edited_at, m.deleted_at, m.deleted_by
      FROM chat_messages m
      INNER JOIN users u ON u.id = m.author_user_id
      WHERE m.team_id = $1
        AND (m.id = $2 OR m.root_message_id = $2)
      ORDER BY m.created_at ASC
    `,
    [storageTeamId(actor), rootMessageId],
  );
  const messages = await buildMessages(rows, actor);
  const rootMessage = messages.find((message) => message.id === rootMessageId);
  if (!rootMessage) return { status: "notFound" };

  const { rows: followRows } = await pool.query<{ following: boolean }>(
    "SELECT following FROM chat_thread_follows WHERE root_message_id = $1 AND user_id = $2 LIMIT 1",
    [rootMessageId, actor.id],
  );
  const now = nowIso();
  await pool.query(
    `
      INSERT INTO chat_thread_follows (root_message_id, user_id, following, last_viewed_at, updated_at)
      VALUES ($1, $2, true, $3, $3)
      ON CONFLICT (root_message_id, user_id)
      DO UPDATE SET last_viewed_at = EXCLUDED.last_viewed_at, updated_at = EXCLUDED.updated_at
    `,
    [rootMessageId, actor.id, now],
  );
  const updatedChannel = await getVisibleChannel(actor, root.channel_id);
  if (!updatedChannel) return { status: "notFound" };
  publishRealtimeChatEvent(storageTeamId(actor), [actor.id], {
    eventType: "read.changed",
    channelId: updatedChannel.id,
    actorUserId: actor.id,
    channel: updatedChannel,
  });
  return ok({
    channel: updatedChannel,
    thread: {
      rootMessage,
      replies: messages.filter((message) => message.rootMessageId === rootMessageId),
      following: followRows[0]?.following ?? true,
    },
  });
}

export async function listChatThreads(actor: ChatActor): Promise<Outcome<{ threads: ChatThreadSummary[] }>> {
  if (!actor.canRead) return { status: "forbidden" };
  const teamId = storageTeamId(actor);
  await preparePublicChannels(teamId);

  type ThreadSummaryRow = MessageRow & {
    channel_archived_at: Date | string | null;
    channel_created_at: Date | string;
    channel_created_by: string | null;
    channel_display_name: string;
    channel_header: string;
    channel_name: string | null;
    channel_purpose: string;
    channel_type: ChatChannelType;
    channel_updated_at: Date | string;
    following: boolean;
    thread_last_viewed_at: Date | string | null;
    thread_unread_count: number;
  };
  const { rows } = await pool.query<ThreadSummaryRow>(
    `
      SELECT root.id, root.channel_id, root.author_user_id, u.name AS author_name,
             u.avatar_object_key AS author_avatar_object_key, u.avatar_updated_at AS author_avatar_updated_at,
             root.body, root.root_message_id, root.parent_message_id,
             root.created_at, root.updated_at, root.edited_at, root.deleted_at, root.deleted_by,
             c.type AS channel_type, c.name AS channel_name, c.display_name AS channel_display_name,
             c.purpose AS channel_purpose, c.header AS channel_header, c.created_by AS channel_created_by,
             c.created_at AS channel_created_at, c.updated_at AS channel_updated_at, c.archived_at AS channel_archived_at,
             f.following, f.last_viewed_at AS thread_last_viewed_at,
             COALESCE(unread.count, 0)::int AS thread_unread_count
      FROM chat_thread_follows f
      INNER JOIN chat_messages root ON root.id = f.root_message_id
        AND root.team_id = $1
        AND root.root_message_id IS NULL
        AND root.deleted_at IS NULL
      INNER JOIN chat_channels c ON c.id = root.channel_id
        AND c.team_id = $1
        AND c.archived_at IS NULL
      INNER JOIN chat_channel_members cm ON cm.channel_id = c.id AND cm.user_id = $2
      INNER JOIN users u ON u.id = root.author_user_id
      LEFT JOIN LATERAL (
        SELECT count(*) AS count
        FROM chat_messages reply
        WHERE reply.team_id = $1
          AND reply.root_message_id = root.id
          AND reply.deleted_at IS NULL
          AND reply.author_user_id <> $2
          AND (f.last_viewed_at IS NULL OR reply.created_at > f.last_viewed_at)
      ) unread ON true
      LEFT JOIN LATERAL (
        SELECT max(created_at) AS last_reply_at
        FROM chat_messages reply
        WHERE reply.team_id = $1
          AND reply.root_message_id = root.id
          AND reply.deleted_at IS NULL
      ) latest_reply ON true
      WHERE f.user_id = $2
        AND f.following = true
      ORDER BY COALESCE(unread.count, 0) > 0 DESC,
               COALESCE(latest_reply.last_reply_at, root.created_at) DESC
      LIMIT 100
    `,
    [teamId, actor.id],
  );

  const messageRows = rows.map((row) => ({
    id: row.id,
    channel_id: row.channel_id,
    author_user_id: row.author_user_id,
    author_name: row.author_name,
    author_avatar_object_key: row.author_avatar_object_key,
    author_avatar_updated_at: row.author_avatar_updated_at,
    body: row.body,
    root_message_id: row.root_message_id,
    parent_message_id: row.parent_message_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    edited_at: row.edited_at,
    deleted_at: row.deleted_at,
    deleted_by: row.deleted_by,
  }));
  const channelRows = rows.map((row) => ({
    id: row.channel_id,
    type: row.channel_type,
    name: row.channel_name,
    display_name: row.channel_display_name,
    purpose: row.channel_purpose,
    header: row.channel_header,
    created_by: row.channel_created_by,
    archived_by: null,
    created_at: row.channel_created_at,
    updated_at: row.channel_updated_at,
    archived_at: row.channel_archived_at,
  }));
  const [messages, channels] = await Promise.all([
    buildMessages(messageRows, actor),
    buildChannels(channelRows, actor),
  ]);
  const messagesById = new Map(messages.map((message) => [message.id, message]));
  const channelsById = new Map(channels.map((channel) => [channel.id, channel]));

  return ok({
    threads: rows.flatMap((row) => {
      const rootMessage = messagesById.get(row.id);
      const channel = channelsById.get(row.channel_id);
      return rootMessage && channel ? [{
        channel,
        following: row.following,
        lastViewedAt: iso(row.thread_last_viewed_at),
        rootMessage,
        unreadCount: Number(row.thread_unread_count),
      }] : [];
    }),
  });
}

export async function createChatChannel(
  input: { displayName: string; header?: string; memberUserIds?: string[]; name?: string; purpose?: string; type: "public" | "private" },
  actor: ChatActor,
): Promise<Outcome<{ channel: ChatChannel }>> {
  if (!actor.canRead) return { status: "forbidden" };
  if (input.type === "public" && !actor.canCreatePublicChannel) return { status: "forbidden" };
  if (input.type === "private" && !actor.canCreatePrivateChannel) return { status: "forbidden" };

  const displayName = input.displayName.trim();
  if (!displayName) return { status: "invalid" };
  const name = normalizeChannelName(input.name?.trim() || displayName);
  if (!name) return { status: "invalid" };
  const now = nowIso();
  const id = makeId("chat-channel");
  const teamId = storageTeamId(actor);

  try {
    await pool.query(
      `
        INSERT INTO chat_channels (id, team_id, type, name, display_name, purpose, header, created_by, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
      `,
      [id, teamId, input.type, name, displayName, input.purpose?.trim() ?? "", input.header?.trim() ?? "", actor.id, now],
    );
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "23505") {
      return { status: "conflict" };
    }
    throw error;
  }

  if (input.type === "public") {
    await ensurePublicChannelMemberships(teamId);
  } else {
    const memberIds = Array.from(new Set([actor.id, ...(input.memberUserIds ?? [])].filter(Boolean)));
    await addChannelMembersInternal({
      channelId: id,
      memberUserIds: memberIds,
      ownerUserId: actor.id,
      teamId,
    });
  }

  const channel = await getVisibleChannel(actor, id);
  if (!channel) return { status: "notFound" };
  const recipients = await getChannelRecipientIds(teamId, id);
  publishRealtimeChatEvent(teamId, recipients, {
    eventType: "channel.created",
    channelId: id,
    actorUserId: actor.id,
    channel,
  });
  return ok({ channel });
}

async function addChannelMembersInternal(input: { channelId: string; memberUserIds: string[]; ownerUserId?: string; teamId: string }) {
  const uniqueMemberIds = Array.from(new Set(input.memberUserIds.filter(Boolean)));
  if (uniqueMemberIds.length === 0) return;
  const now = nowIso();
  await pool.query(
    `
      INSERT INTO chat_channel_members (channel_id, user_id, role, favorite, muted, manually_unread, joined_at)
      SELECT $1, u.id, CASE WHEN u.id = $4 THEN 'owner'::chat_member_role ELSE 'member'::chat_member_role END, false, false, false, $3
      FROM users u
      INNER JOIN team_members tm ON tm.user_id = u.id AND tm.team_id = $2
      WHERE u.id = ANY($5::uuid[])
        AND COALESCE(u.status, 'active') = 'active'
      ON CONFLICT (channel_id, user_id) DO NOTHING
    `,
    [input.channelId, input.teamId, now, input.ownerUserId ?? null, uniqueMemberIds],
  );
}

export async function createDirectOrGroupChannel(input: { userIds: string[] }, actor: ChatActor): Promise<Outcome<{ channel: ChatChannel }>> {
  if (!actor.canRead || !actor.canWrite) return { status: "forbidden" };
  const memberIds = Array.from(new Set([actor.id, ...input.userIds].filter(Boolean))).sort();
  if (memberIds.length < 2) return { status: "invalid" };

  const teamId = storageTeamId(actor);
  const type: ChatChannelType = memberIds.length === 2 ? "direct" : "group";
  const name = stableConversationName(type === "direct" ? "dm" : "gm", memberIds);
  const activeUsers = await listActiveTeamUsers(teamId);
  const activeUserIds = new Set(activeUsers.map((user) => user.id));
  if (memberIds.some((id) => !activeUserIds.has(id))) return { status: "notFound" };

  const namesById = new Map(activeUsers.map((user) => [user.id, user.name]));
  const displayName = memberIds.map((id) => namesById.get(id)).filter(Boolean).join(", ");
  const now = nowIso();
  const id = makeId("chat-channel");
  const { rows } = await pool.query<{ id: string }>(
    `
      INSERT INTO chat_channels (id, team_id, type, name, display_name, purpose, header, created_by, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, '', '', $6, $7, $7)
      ON CONFLICT (team_id, name) DO UPDATE SET updated_at = chat_channels.updated_at
      RETURNING id
    `,
    [id, teamId, type, name, displayName, actor.id, now],
  );
  const channelId = rows[0]?.id ?? id;
  await addChannelMembersInternal({ channelId, memberUserIds: memberIds, ownerUserId: actor.id, teamId });

  const channel = await getVisibleChannel(actor, channelId);
  if (!channel) return { status: "notFound" };
  const recipients = await getChannelRecipientIds(teamId, channelId);
  publishRealtimeChatEvent(teamId, recipients, {
    eventType: "channel.created",
    channelId,
    actorUserId: actor.id,
    channel,
  });
  return ok({ channel });
}

export async function updateChatChannel(
  channelId: string,
  input: { displayName?: string; favorite?: boolean; header?: string; muted?: boolean; name?: string; purpose?: string },
  actor: ChatActor,
): Promise<Outcome<{ channel: ChatChannel }>> {
  if (!actor.canRead) return { status: "forbidden" };
  const channel = await getVisibleChannel(actor, channelId);
  if (!channel) return { status: "notFound" };

  if (input.favorite !== undefined || input.muted !== undefined) {
    await pool.query(
      `
        UPDATE chat_channel_members
        SET favorite = COALESCE($3, favorite), muted = COALESCE($4, muted)
        WHERE channel_id = $1 AND user_id = $2
      `,
      [channelId, actor.id, input.favorite ?? null, input.muted ?? null],
    );
  }

  const metadataChanged =
    input.displayName !== undefined || input.header !== undefined || input.name !== undefined || input.purpose !== undefined;
  if (metadataChanged) {
    if (channel.type === "direct" || channel.type === "group") return { status: "forbidden" };
    if (!(await canManageChannel(actor, channelId))) return { status: "forbidden" };
    const displayName = input.displayName?.trim();
    const name = input.name === undefined ? undefined : normalizeChannelName(input.name);
    if ((input.displayName !== undefined && !displayName) || (input.name !== undefined && !name)) return { status: "invalid" };

    try {
      await pool.query(
        `
          UPDATE chat_channels
          SET display_name = COALESCE($2, display_name),
              name = COALESCE($3, name),
              purpose = COALESCE($4, purpose),
              header = COALESCE($5, header),
              updated_at = $6
          WHERE id = $1
        `,
        [channelId, displayName ?? null, name ?? null, input.purpose?.trim() ?? null, input.header?.trim() ?? null, nowIso()],
      );
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "23505") {
        return { status: "conflict" };
      }
      throw error;
    }
  }

  const updated = await getVisibleChannel(actor, channelId);
  if (!updated) return { status: "notFound" };
  const recipients = await getChannelRecipientIds(storageTeamId(actor), channelId);
  publishRealtimeChatEvent(storageTeamId(actor), recipients, {
    eventType: "channel.updated",
    channelId,
    actorUserId: actor.id,
    channel: updated,
  });
  return ok({ channel: updated });
}

export async function archiveChatChannel(channelId: string, actor: ChatActor): Promise<Outcome<{ channelId: string }>> {
  if (!actor.canRead) return { status: "forbidden" };
  const channel = await getVisibleChannel(actor, channelId);
  if (!channel) return { status: "notFound" };
  if (channel.type === "direct" || channel.type === "group" || channel.name === DEFAULT_PUBLIC_CHANNEL_NAME) return { status: "forbidden" };
  if (!(await canManageChannel(actor, channelId))) return { status: "forbidden" };

  await pool.query("UPDATE chat_channels SET archived_at = $3, archived_by = $2, updated_at = $3 WHERE id = $1", [
    channelId,
    actor.id,
    nowIso(),
  ]);
  const recipients = await getChannelRecipientIds(storageTeamId(actor), channelId);
  publishRealtimeChatEvent(storageTeamId(actor), recipients, {
    eventType: "channel.archived",
    channelId,
    actorUserId: actor.id,
  });
  return ok({ channelId });
}

export async function addChatChannelMembers(
  channelId: string,
  memberUserIds: string[],
  actor: ChatActor,
): Promise<Outcome<{ channel: ChatChannel }>> {
  if (!actor.canRead) return { status: "forbidden" };
  const channel = await getVisibleChannel(actor, channelId);
  if (!channel) return { status: "notFound" };
  if (channel.type === "public") return { status: "forbidden" };
  if (!(await canManageChannel(actor, channelId))) return { status: "forbidden" };

  await addChannelMembersInternal({ channelId, memberUserIds, teamId: storageTeamId(actor) });
  const updated = await getVisibleChannel(actor, channelId);
  if (!updated) return { status: "notFound" };
  const recipients = await getChannelRecipientIds(storageTeamId(actor), channelId);
  publishRealtimeChatEvent(storageTeamId(actor), recipients, {
    eventType: "member.changed",
    channelId,
    actorUserId: actor.id,
    channel: updated,
  });
  return ok({ channel: updated });
}

export async function removeChatChannelMember(
  channelId: string,
  userId: string,
  actor: ChatActor,
): Promise<Outcome<{ channel: ChatChannel | null }>> {
  if (!actor.canRead) return { status: "forbidden" };
  const channel = await getVisibleChannel(actor, channelId);
  if (!channel) return { status: "notFound" };
  if (channel.type === "public") return { status: "forbidden" };
  const selfLeave = userId === actor.id;
  if (!selfLeave && !(await canManageChannel(actor, channelId))) return { status: "forbidden" };

  const target = channel.members.find((member) => member.userId === userId);
  if (!target) return { status: "notFound" };
  if (target.role === "owner" && channel.members.filter((member) => member.role === "owner").length <= 1 && !selfLeave) {
    return { status: "forbidden" };
  }

  await pool.query("DELETE FROM chat_channel_members WHERE channel_id = $1 AND user_id = $2", [channelId, userId]);
  const recipients = Array.from(new Set([...(await getChannelRecipientIds(storageTeamId(actor), channelId)), userId]));
  const updated = selfLeave ? null : await getVisibleChannel(actor, channelId);
  publishRealtimeChatEvent(storageTeamId(actor), recipients, {
    eventType: "member.changed",
    channelId,
    actorUserId: actor.id,
    channel: updated ?? undefined,
  });
  return ok({ channel: updated });
}

export async function sendChatMessage(
  input: { attachmentIds?: string[]; body: string; channelId: string; parentMessageId?: string | null; rootMessageId?: string | null },
  actor: ChatActor,
): Promise<Outcome<{ channel: ChatChannel; message: ChatMessage }>> {
  if (!actor.canRead || !actor.canWrite) return { status: "forbidden" };
  const body = input.body.trim();
  const attachmentIds = Array.from(new Set((input.attachmentIds ?? []).filter(Boolean)));
  if (!body && attachmentIds.length === 0) return { status: "invalid" };
  const channel = await getVisibleChannel(actor, input.channelId);
  if (!channel) return { status: "notFound" };
  if (channel.archivedAt) return { status: "forbidden" };

  const teamId = storageTeamId(actor);
  let rootMessageId = input.rootMessageId?.trim() || null;
  let parentMessageId = input.parentMessageId?.trim() || null;
  if (rootMessageId) {
    const root = await getRawMessage(actor, rootMessageId);
    if (!root || root.channel_id !== input.channelId || root.root_message_id !== null || root.deleted_at) return { status: "notFound" };
    if (parentMessageId) {
      const parent = await getRawMessage(actor, parentMessageId);
      if (!parent || parent.channel_id !== input.channelId || (parent.id !== rootMessageId && parent.root_message_id !== rootMessageId)) {
        parentMessageId = rootMessageId;
      }
    } else {
      parentMessageId = rootMessageId;
    }
  } else {
    parentMessageId = null;
  }

  const messageId = makeId("chat-message");
  const now = nowIso();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (attachmentIds.length > 0) {
      const { rows } = await client.query<{ id: string }>(
        `
          SELECT id
          FROM chat_attachments
          WHERE id = ANY($1::text[])
            AND team_id = $2
            AND channel_id = $3
            AND created_by = $4
            AND message_id IS NULL
            AND expires_at > $5
          FOR UPDATE
        `,
        [attachmentIds, teamId, input.channelId, actor.id, now],
      );
      if (rows.length !== attachmentIds.length) {
        await client.query("ROLLBACK");
        return { status: "invalid" };
      }
    }

    await client.query(
      `
        INSERT INTO chat_messages (id, team_id, channel_id, author_user_id, body, root_message_id, parent_message_id, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
      `,
      [messageId, teamId, input.channelId, actor.id, body, rootMessageId, parentMessageId, now],
    );
    if (attachmentIds.length > 0) {
      await client.query(
        `
          UPDATE chat_attachments
          SET message_id = $1, attached_at = $4
          WHERE id = ANY($2::text[])
            AND created_by = $3
        `,
        [messageId, attachmentIds, actor.id, now],
      );
    }
    await client.query(
      `
        INSERT INTO chat_thread_follows (root_message_id, user_id, following, last_viewed_at, updated_at)
        VALUES ($1, $2, true, $3, $3)
        ON CONFLICT (root_message_id, user_id)
        DO UPDATE SET following = true, updated_at = EXCLUDED.updated_at
      `,
      [rootMessageId ?? messageId, actor.id, now],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }

  const message = await getMessageById(actor, messageId);
  const updatedChannel = await getVisibleChannel(actor, input.channelId);
  if (!message || !updatedChannel) return { status: "notFound" };
  const recipients = await getChannelRecipientIds(teamId, input.channelId);
  publishRealtimeChatEvent(teamId, recipients, {
    eventType: "message.created",
    channelId: input.channelId,
    actorUserId: actor.id,
    message,
    rootMessageId,
    channel: updatedChannel,
  });
  await createChatNotifications({
    actor,
    body,
    channel: updatedChannel,
    message,
    mentionedUserIds: extractMentionUserIds(body),
    recipientUserIds: recipients,
    rootMessageId,
  });
  return ok({ channel: updatedChannel, message });
}

export async function updateChatMessage(
  input: { body: string; channelId: string; messageId: string },
  actor: ChatActor,
): Promise<Outcome<{ message: ChatMessage }>> {
  if (!actor.canRead || !actor.canWrite) return { status: "forbidden" };
  const body = input.body.trim();
  if (!body) return { status: "invalid" };
  const channel = await getVisibleChannel(actor, input.channelId);
  if (!channel) return { status: "notFound" };
  const message = await getRawMessage(actor, input.messageId);
  if (!message || message.channel_id !== input.channelId || message.deleted_at) return { status: "notFound" };
  if (message.author_user_id !== actor.id) return { status: "forbidden" };

  await pool.query("UPDATE chat_messages SET body = $3, updated_at = $4, edited_at = $4 WHERE id = $1 AND channel_id = $2", [
    input.messageId,
    input.channelId,
    body,
    nowIso(),
  ]);
  const updated = await getMessageById(actor, input.messageId);
  if (!updated) return { status: "notFound" };
  const recipients = await getChannelRecipientIds(storageTeamId(actor), input.channelId);
  publishRealtimeChatEvent(storageTeamId(actor), recipients, {
    eventType: "message.updated",
    channelId: input.channelId,
    actorUserId: actor.id,
    message: updated,
    rootMessageId: updated.rootMessageId ?? null,
  });
  return ok({ message: updated });
}

export async function deleteChatMessage(
  input: { channelId: string; messageId: string },
  actor: ChatActor,
): Promise<Outcome<{ message: ChatMessage }>> {
  if (!actor.canRead) return { status: "forbidden" };
  const channel = await getVisibleChannel(actor, input.channelId);
  if (!channel) return { status: "notFound" };
  const message = await getRawMessage(actor, input.messageId);
  if (!message || message.channel_id !== input.channelId || message.deleted_at) return { status: "notFound" };
  const mayManage = await canManageChannel(actor, input.channelId);
  if (message.author_user_id !== actor.id && !mayManage) return { status: "forbidden" };

  await pool.query("UPDATE chat_messages SET deleted_at = $3, deleted_by = $4, updated_at = $3 WHERE id = $1 AND channel_id = $2", [
    input.messageId,
    input.channelId,
    nowIso(),
    actor.id,
  ]);
  const updated = await getMessageById(actor, input.messageId);
  if (!updated) return { status: "notFound" };
  const recipients = await getChannelRecipientIds(storageTeamId(actor), input.channelId);
  publishRealtimeChatEvent(storageTeamId(actor), recipients, {
    eventType: "message.deleted",
    channelId: input.channelId,
    actorUserId: actor.id,
    message: updated,
    messageId: input.messageId,
    rootMessageId: updated.rootMessageId ?? null,
  });
  return ok({ message: updated });
}

export async function setChatReaction(
  input: { channelId: string; emojiName: string; messageId: string; reacting: boolean },
  actor: ChatActor,
): Promise<Outcome<{ message: ChatMessage }>> {
  if (!actor.canRead || !actor.canWrite) return { status: "forbidden" };
  const emojiName = input.emojiName.trim().slice(0, 80);
  if (!emojiName) return { status: "invalid" };
  const channel = await getVisibleChannel(actor, input.channelId);
  if (!channel) return { status: "notFound" };
  const message = await getRawMessage(actor, input.messageId);
  if (!message || message.channel_id !== input.channelId || message.deleted_at) return { status: "notFound" };

  if (input.reacting) {
    await pool.query(
      `
        INSERT INTO chat_message_reactions (message_id, user_id, emoji_name, created_at)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (message_id, user_id, emoji_name) DO NOTHING
      `,
      [input.messageId, actor.id, emojiName, nowIso()],
    );
  } else {
    await pool.query("DELETE FROM chat_message_reactions WHERE message_id = $1 AND user_id = $2 AND emoji_name = $3", [
      input.messageId,
      actor.id,
      emojiName,
    ]);
  }

  const updated = await getMessageById(actor, input.messageId);
  if (!updated) return { status: "notFound" };
  const recipients = await getChannelRecipientIds(storageTeamId(actor), input.channelId);
  publishRealtimeChatEvent(storageTeamId(actor), recipients, {
    eventType: "reaction.changed",
    channelId: input.channelId,
    actorUserId: actor.id,
    message: updated,
    rootMessageId: updated.rootMessageId ?? null,
  });
  return ok({ message: updated });
}

export async function setChatMessagePin(
  input: { channelId: string; messageId: string; pinned: boolean },
  actor: ChatActor,
): Promise<Outcome<{ message: ChatMessage }>> {
  if (!actor.canRead || !actor.canWrite) return { status: "forbidden" };
  const channel = await getVisibleChannel(actor, input.channelId);
  if (!channel) return { status: "notFound" };
  const message = await getRawMessage(actor, input.messageId);
  if (!message || message.channel_id !== input.channelId || message.deleted_at) return { status: "notFound" };
  if (!(await canManageChannel(actor, input.channelId))) return { status: "forbidden" };

  if (input.pinned) {
    await pool.query(
      `
        INSERT INTO chat_message_pins (message_id, channel_id, pinned_by, pinned_at)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (message_id)
        DO UPDATE SET pinned_by = EXCLUDED.pinned_by, pinned_at = EXCLUDED.pinned_at
      `,
      [input.messageId, input.channelId, actor.id, nowIso()],
    );
  } else {
    await pool.query("DELETE FROM chat_message_pins WHERE message_id = $1 AND channel_id = $2", [input.messageId, input.channelId]);
  }

  const updated = await getMessageById(actor, input.messageId);
  if (!updated) return { status: "notFound" };
  const recipients = await getChannelRecipientIds(storageTeamId(actor), input.channelId);
  publishRealtimeChatEvent(storageTeamId(actor), recipients, {
    eventType: "message.updated",
    channelId: input.channelId,
    actorUserId: actor.id,
    message: updated,
    rootMessageId: updated.rootMessageId ?? null,
  });
  return ok({ message: updated });
}

export async function setChatMessageSaved(
  input: { channelId: string; messageId: string; saved: boolean },
  actor: ChatActor,
): Promise<Outcome<{ message: ChatMessage }>> {
  if (!actor.canRead) return { status: "forbidden" };
  const channel = await getVisibleChannel(actor, input.channelId);
  if (!channel) return { status: "notFound" };
  const message = await getRawMessage(actor, input.messageId);
  if (!message || message.channel_id !== input.channelId || message.deleted_at) return { status: "notFound" };

  if (input.saved) {
    await pool.query(
      `
        INSERT INTO chat_message_saves (message_id, user_id, saved_at)
        VALUES ($1, $2, $3)
        ON CONFLICT (message_id, user_id)
        DO UPDATE SET saved_at = EXCLUDED.saved_at
      `,
      [input.messageId, actor.id, nowIso()],
    );
  } else {
    await pool.query("DELETE FROM chat_message_saves WHERE message_id = $1 AND user_id = $2", [input.messageId, actor.id]);
  }

  const updated = await getMessageById(actor, input.messageId);
  if (!updated) return { status: "notFound" };
  publishRealtimeChatEvent(storageTeamId(actor), [actor.id], {
    eventType: "message.updated",
    channelId: input.channelId,
    actorUserId: actor.id,
    message: updated,
    rootMessageId: updated.rootMessageId ?? null,
  });
  return ok({ message: updated });
}

export async function listPinnedChatMessages(channelId: string, actor: ChatActor): Promise<Outcome<{ results: ChatSearchResult[] }>> {
  if (!actor.canRead) return { status: "forbidden" };
  const channel = await getVisibleChannel(actor, channelId);
  if (!channel) return { status: "notFound" };

  const { rows } = await pool.query<MessageRow>(
    `
      SELECT m.id, m.channel_id, m.author_user_id, u.name AS author_name, u.avatar_object_key AS author_avatar_object_key,
             u.avatar_updated_at AS author_avatar_updated_at, m.body, m.root_message_id, m.parent_message_id,
             m.created_at, m.updated_at, m.edited_at, m.deleted_at, m.deleted_by
      FROM chat_message_pins p
      INNER JOIN chat_messages m ON m.id = p.message_id
      INNER JOIN users u ON u.id = m.author_user_id
      WHERE p.channel_id = $1
        AND m.team_id = $2
        AND m.deleted_at IS NULL
      ORDER BY p.pinned_at DESC
      LIMIT 100
    `,
    [channelId, storageTeamId(actor)],
  );
  const messages = await buildMessages(rows, actor);
  return ok({ results: messages.map((message) => ({ channel, message })) });
}

export async function listSavedChatMessages(actor: ChatActor): Promise<Outcome<{ results: ChatSearchResult[] }>> {
  if (!actor.canRead) return { status: "forbidden" };
  const teamId = storageTeamId(actor);
  await preparePublicChannels(teamId);
  const { rows } = await pool.query<MessageRow & { channel_id_for_channel: string }>(
    `
      SELECT m.id, m.channel_id, m.author_user_id, u.name AS author_name, u.avatar_object_key AS author_avatar_object_key,
             u.avatar_updated_at AS author_avatar_updated_at, m.body, m.root_message_id, m.parent_message_id,
             m.created_at, m.updated_at, m.edited_at, m.deleted_at, m.deleted_by,
             c.id AS channel_id_for_channel
      FROM chat_message_saves s
      INNER JOIN chat_messages m ON m.id = s.message_id
      INNER JOIN chat_channels c ON c.id = m.channel_id
      INNER JOIN chat_channel_members cm ON cm.channel_id = c.id AND cm.user_id = $2
      INNER JOIN users u ON u.id = m.author_user_id
      WHERE m.team_id = $1
        AND m.deleted_at IS NULL
        AND c.archived_at IS NULL
      ORDER BY s.saved_at DESC
      LIMIT 100
    `,
    [teamId, actor.id],
  );
  const messages = await buildMessages(rows, actor);
  const uniqueChannelRows = await listVisibleChannelRows(actor);
  const channelsById = new Map((await buildChannels(uniqueChannelRows, actor)).map((channel) => [channel.id, channel]));
  return ok({
    results: messages.flatMap((message) => {
      const channel = channelsById.get(message.channelId);
      return channel ? [{ channel, message }] : [];
    }),
  });
}

export async function markChatChannelRead(channelId: string, actor: ChatActor): Promise<Outcome<{ channel: ChatChannel }>> {
  if (!actor.canRead) return { status: "forbidden" };
  const channel = await getVisibleChannel(actor, channelId);
  if (!channel) return { status: "notFound" };
  const readAt = nowIso();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<{ id: string }>(
      `
        SELECT id
        FROM chat_messages
        WHERE channel_id = $1
          AND root_message_id IS NULL
          AND deleted_at IS NULL
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [channelId],
    );
    await client.query(
      `
        UPDATE chat_channel_members
        SET last_viewed_at = $3, last_read_at = $3, last_read_message_id = $4, manually_unread = false
        WHERE channel_id = $1 AND user_id = $2
      `,
      [channelId, actor.id, readAt, rows[0]?.id ?? null],
    );
    await client.query(
      `
        UPDATE chat_thread_follows f
        SET last_viewed_at = $3, updated_at = $3
        FROM chat_messages root
        WHERE f.root_message_id = root.id
          AND f.user_id = $2
          AND root.channel_id = $1
          AND root.team_id = $4
          AND root.root_message_id IS NULL
          AND root.deleted_at IS NULL
      `,
      [channelId, actor.id, readAt, storageTeamId(actor)],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
  const updated = await getVisibleChannel(actor, channelId);
  if (!updated) return { status: "notFound" };
  publishRealtimeChatEvent(storageTeamId(actor), [actor.id], {
    eventType: "read.changed",
    channelId,
    actorUserId: actor.id,
    channel: updated,
  });
  return ok({ channel: updated });
}

export async function setChatChannelUnread(
  input: { channelId: string; messageId?: string | null },
  actor: ChatActor,
): Promise<Outcome<{ channel: ChatChannel }>> {
  if (!actor.canRead) return { status: "forbidden" };
  const channel = await getVisibleChannel(actor, input.channelId);
  if (!channel) return { status: "notFound" };

  if (input.messageId) {
    const message = await getRawMessage(actor, input.messageId);
    if (!message || message.channel_id !== input.channelId || message.deleted_at) return { status: "notFound" };
    const rootMessage = message.root_message_id ? await getRawMessage(actor, message.root_message_id) : message;
    if (!rootMessage || rootMessage.channel_id !== input.channelId || rootMessage.root_message_id !== null) return { status: "notFound" };
    const { rows } = await pool.query<{ created_at: Date | string; id: string }>(
      `
        SELECT id, created_at
        FROM chat_messages
        WHERE team_id = $1
          AND channel_id = $2
          AND root_message_id IS NULL
          AND deleted_at IS NULL
          AND created_at < $3
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [storageTeamId(actor), input.channelId, rootMessage.created_at],
    );
    await pool.query(
      `
        UPDATE chat_channel_members
        SET last_read_at = $3, last_read_message_id = $4, manually_unread = true
        WHERE channel_id = $1 AND user_id = $2
      `,
      [input.channelId, actor.id, rows[0]?.created_at ?? null, rows[0]?.id ?? null],
    );
  } else {
    await pool.query(
      `
        UPDATE chat_channel_members
        SET manually_unread = true
        WHERE channel_id = $1 AND user_id = $2
      `,
      [input.channelId, actor.id],
    );
  }

  const updated = await getVisibleChannel(actor, input.channelId);
  if (!updated) return { status: "notFound" };
  publishRealtimeChatEvent(storageTeamId(actor), [actor.id], {
    eventType: "read.changed",
    channelId: input.channelId,
    actorUserId: actor.id,
    channel: updated,
  });
  return ok({ channel: updated });
}

export async function setChatThreadFollow(
  rootMessageId: string,
  following: boolean,
  actor: ChatActor,
): Promise<Outcome<{ thread: ChatThread }>> {
  const threadOutcome = await getChatThread(rootMessageId, actor);
  if (threadOutcome.status !== "ok") return threadOutcome;
  await pool.query(
    `
      INSERT INTO chat_thread_follows (root_message_id, user_id, following, last_viewed_at, updated_at)
      VALUES ($1, $2, $3, $4, $4)
      ON CONFLICT (root_message_id, user_id)
      DO UPDATE SET following = EXCLUDED.following, updated_at = EXCLUDED.updated_at
    `,
    [rootMessageId, actor.id, following, nowIso()],
  );
  return getChatThread(rootMessageId, actor);
}

export async function publishChatTyping(channelId: string, actor: ChatActor): Promise<Outcome<{ ok: true }>> {
  if (!actor.canRead || !actor.canWrite) return { status: "forbidden" };
  const channel = await getVisibleChannel(actor, channelId);
  if (!channel) return { status: "notFound" };
  const recipients = (await getChannelRecipientIds(storageTeamId(actor), channelId)).filter((id) => id !== actor.id);
  publishRealtimeChatEvent(storageTeamId(actor), recipients, {
    eventType: "typing",
    channelId,
    actorUserId: actor.id,
    typing: {
      userId: actor.id,
      userName: actor.name,
      expiresAt: new Date(Date.now() + 4500).toISOString(),
    },
  });
  return ok({ ok: true });
}

export async function uploadChatAttachment(
  input: { body: Buffer; channelId: string; fileName: string; mimeType: string },
  actor: ChatActor,
): Promise<Outcome<{ attachment: ChatAttachment }>> {
  if (!actor.canRead || !actor.canWrite) return { status: "forbidden" };
  if (!input.body.byteLength || !input.fileName.trim()) return { status: "invalid" };
  if (input.body.byteLength > env.CHAT_FILE_UPLOAD_MAX_BYTES) return { status: "tooLarge" };
  const channel = await getVisibleChannel(actor, input.channelId);
  if (!channel) return { status: "notFound" };

  const id = makeChatAttachmentId();
  const now = nowIso();
  const expiresAt = new Date(Date.now() + CHAT_ATTACHMENT_TTL_MS).toISOString();
  const fileName = input.fileName.trim().slice(0, 240);
  const mimeType = normalizeMimeType(input.mimeType);
  const objectKey = `chat/${safePathSegment(storageTeamId(actor))}/${safePathSegment(input.channelId)}/${id}/${safePathSegment(fileName)}`;

  await objectStorage.putObject({
    body: input.body,
    contentLength: input.body.byteLength,
    contentType: mimeType,
    key: objectKey,
  });

  try {
    await pool.query(
      `
        INSERT INTO chat_attachments (id, team_id, channel_id, message_id, object_key, file_name, mime_type, file_size, width, height, created_by, created_at, expires_at)
        VALUES ($1, $2, $3, null, $4, $5, $6, $7, null, null, $8, $9, $10)
      `,
      [id, storageTeamId(actor), input.channelId, objectKey, fileName, mimeType, input.body.byteLength, actor.id, now, expiresAt],
    );
  } catch (error) {
    await objectStorage.deleteObject(objectKey).catch(() => undefined);
    throw error;
  }

  return ok({
    attachment: {
      id,
      fileName,
      mimeType,
      fileSize: input.body.byteLength,
      contentUrl: chatAttachmentContentUrl(id),
      width: null,
      height: null,
      createdAt: now,
    },
  });
}

export async function getChatAttachmentContent(
  attachmentId: string,
  actor: ChatActor,
): Promise<
  | { status: "ok"; body: Readable; contentLength?: number; contentType: string }
  | { status: "notFound" }
  | { status: "forbidden" }
> {
  if (!actor.canRead) return { status: "forbidden" };
  const { rows } = await pool.query<
    AttachmentRow & {
      channel_archived_at: Date | string | null;
      channel_id: string;
      created_by: string;
      deleted_at: Date | string | null;
      team_id: string;
    }
  >(
    `
      SELECT a.id, a.team_id, a.channel_id, a.message_id, a.object_key, a.file_name, a.mime_type, a.file_size, a.width, a.height,
             a.created_by, a.created_at, c.archived_at AS channel_archived_at, m.deleted_at
      FROM chat_attachments a
      INNER JOIN chat_channels c ON c.id = a.channel_id
      LEFT JOIN chat_messages m ON m.id = a.message_id
      WHERE a.id = $1
        AND a.team_id = $2
      LIMIT 1
    `,
    [attachmentId, storageTeamId(actor)],
  );
  const row = rows[0];
  if (!row || row.deleted_at) return { status: "notFound" };
  const channel = await getVisibleChannel(actor, row.channel_id);
  if (!channel && row.created_by !== actor.id) return { status: "forbidden" };

  const stored = await objectStorage.getObject(row.object_key);
  if (!stored) return { status: "notFound" };
  return {
    status: "ok",
    body: stored.body,
    contentLength: stored.contentLength,
    contentType: stored.contentType ?? row.mime_type,
  };
}

export async function searchChatMessages(
  input: { channelId?: string; q: string; type?: ChatChannelType },
  actor: ChatActor,
): Promise<Outcome<{ results: ChatSearchResult[] }>> {
  if (!actor.canRead) return { status: "forbidden" };
  const parsedQuery = parseChatSearchQuery(input.q);
  if (!hasExecutableChatSearch(parsedQuery)) return ok({ results: [] });
  const teamId = storageTeamId(actor);
  await preparePublicChannels(teamId);
  const params: unknown[] = [teamId, actor.id];
  const clauses: string[] = [];
  const pushParam = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };
  if (parsedQuery.text.length >= 2) {
    const param = pushParam(`%${escapeLikePattern(parsedQuery.text)}%`);
    clauses.push(`
      (
        m.body ILIKE ${param} ESCAPE '\\'
        OR EXISTS (
          SELECT 1
          FROM chat_attachments a
          WHERE a.team_id = m.team_id
            AND a.message_id = m.id
            AND a.file_name ILIKE ${param} ESCAPE '\\'
        )
      )
    `);
  }
  if (parsedQuery.authorQuery) {
    const param = pushParam(`%${escapeLikePattern(parsedQuery.authorQuery)}%`);
    clauses.push(`(u.name ILIKE ${param} ESCAPE '\\' OR u.email ILIKE ${param} ESCAPE '\\')`);
  }
  if (parsedQuery.channelQuery) {
    const param = pushParam(`%${escapeLikePattern(parsedQuery.channelQuery)}%`);
    clauses.push(`(c.display_name ILIKE ${param} ESCAPE '\\' OR COALESCE(c.name, '') ILIKE ${param} ESCAPE '\\')`);
  }
  if (parsedQuery.attachment) {
    clauses.push(`
      EXISTS (
        SELECT 1
        FROM chat_attachments a
        WHERE a.team_id = m.team_id
          AND a.message_id = m.id
          ${parsedQuery.attachment === "image" ? "AND a.mime_type ILIKE 'image/%'" : ""}
      )
    `);
  }
  if (parsedQuery.afterDate) {
    clauses.push(`m.created_at >= ${pushParam(`${parsedQuery.afterDate}T00:00:00.000Z`)}::timestamptz`);
  }
  if (parsedQuery.beforeDate) {
    clauses.push(`m.created_at < ${pushParam(`${addDaysToIsoDate(parsedQuery.beforeDate, 1)}T00:00:00.000Z`)}::timestamptz`);
  }
  if (input.channelId) {
    clauses.push(`c.id = ${pushParam(input.channelId)}`);
  }
  if (input.type) {
    clauses.push(`c.type = ${pushParam(input.type)}`);
  }
  const searchClause = clauses.length > 0 ? `AND ${clauses.join("\n        AND ")}` : "";
  type SearchRow = MessageRow & {
    channel_archived_at: Date | string | null;
    channel_created_at: Date | string;
    channel_created_by: string | null;
    channel_display_name: string;
    channel_header: string;
    channel_name: string | null;
    channel_purpose: string;
    channel_type: ChatChannelType;
    channel_updated_at: Date | string;
  };
  const { rows } = await pool.query<SearchRow>(
    `
      SELECT m.id, m.channel_id, m.author_user_id, u.name AS author_name, u.avatar_object_key AS author_avatar_object_key,
             u.avatar_updated_at AS author_avatar_updated_at, m.body, m.root_message_id, m.parent_message_id,
             m.created_at, m.updated_at, m.edited_at, m.deleted_at, m.deleted_by,
             c.type AS channel_type, c.name AS channel_name, c.display_name AS channel_display_name, c.purpose AS channel_purpose,
             c.header AS channel_header, c.created_by AS channel_created_by, c.created_at AS channel_created_at,
             c.updated_at AS channel_updated_at, c.archived_at AS channel_archived_at
      FROM chat_messages m
      INNER JOIN chat_channels c ON c.id = m.channel_id
      INNER JOIN chat_channel_members cm ON cm.channel_id = c.id AND cm.user_id = $2
      INNER JOIN users u ON u.id = m.author_user_id
      WHERE m.team_id = $1
        AND m.deleted_at IS NULL
        AND c.archived_at IS NULL
        ${searchClause}
      ORDER BY m.created_at DESC
      LIMIT 50
    `,
    params,
  );

  const messageRows = rows.map((row) => ({
    id: row.id,
    channel_id: row.channel_id,
    author_user_id: row.author_user_id,
    author_name: row.author_name,
    author_avatar_object_key: row.author_avatar_object_key,
    author_avatar_updated_at: row.author_avatar_updated_at,
    body: row.body,
    root_message_id: row.root_message_id,
    parent_message_id: row.parent_message_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    edited_at: row.edited_at,
    deleted_at: row.deleted_at,
    deleted_by: row.deleted_by,
  }));
  const messages = await buildMessages(messageRows, actor);
  const channelRows = rows.map((row) => ({
    id: row.channel_id,
    type: row.channel_type,
    name: row.channel_name,
    display_name: row.channel_display_name,
    purpose: row.channel_purpose,
    header: row.channel_header,
    created_by: row.channel_created_by,
    archived_by: null,
    created_at: row.channel_created_at,
    updated_at: row.channel_updated_at,
    archived_at: row.channel_archived_at,
  }));
  const channelsById = new Map((await buildChannels(channelRows, actor)).map((channel) => [channel.id, channel]));
  return ok({
    results: messages.flatMap((message) => {
      const channel = channelsById.get(message.channelId);
      return channel ? [{ channel, message }] : [];
    }),
  });
}

function escapeLikePattern(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

export async function listChatMentionableUsers(channelId: string, actor: ChatActor): Promise<Outcome<{ users: ChatUser[] }>> {
  if (!actor.canRead) return { status: "forbidden" };
  const channel = await getVisibleChannel(actor, channelId);
  if (!channel) return { status: "notFound" };
  if (channel.type === "public") {
    return ok({ users: await listActiveTeamUsers(storageTeamId(actor)) });
  }
  const memberIds = channel.members.map((member) => member.userId);
  const usersById = await loadUsersByIds(memberIds);
  return ok({ users: memberIds.map((id) => usersById.get(id)).filter((user): user is ChatUser => Boolean(user)) });
}
