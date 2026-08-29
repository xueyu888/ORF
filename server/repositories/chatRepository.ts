import type { Readable } from "node:stream";
import {
  byteRangeContentLength,
  resolveByteRangeSelection,
  type ByteRangeSelection,
  type ResolvedByteRange,
} from "@orf/module-protocol";
import type { PoolClient } from "pg";
import type {
  ChatAttachment,
  ChatBootstrap,
  ChatChannel,
  ChatChannelMember,
  ChatChannelType,
  ChatMessageContext,
  ChatMessage,
  ChatMessageAcknowledgement,
  ChatMessageSource,
  ChatMessageSystemMetadata,
  ChatPollSelectionMode,
  ChatPollVisibility,
  ChatReaction,
  ChatSearchResult,
  ChatThread,
  ChatThreadSummary,
  ChatUnreadTarget,
  ChatUnreadSummary,
  ChatUser,
  ProjectChatChannel,
} from "../../src/types/orf";
import { chatMessageTargetPath } from "../../src/domain/chatNavigation";
import { CHAT_POLL_INPUT_CONTRACT } from "../../src/domain/chatPollContract";
import type { PermissionKey } from "../../src/config/permissions";
import { attachmentNativeVideoContentType, attachmentPreviewKind } from "../../src/domain/attachmentPreviewKind";
import { addDaysToIsoDate, hasExecutableChatSearch, parseChatSearchQuery } from "../../src/features/chat/chatSearchSyntax";
import { chatNotificationPreviewText } from "../../src/domain/chatNotificationPresentation";
import { pool } from "../db/client";
import {
  enqueueChatPushDeliveries,
  type ChatPushDeliveryClaim,
} from "../chat/chatPushDeliveryOutbox";
import { wakeChatPushDeliveryWorker } from "../chat/chatPushDeliveryWorker";
import { publishChatMessageCreatedRealtime, publishChatMessageMutationRealtime } from "../chat/chatMessageRealtime";
import {
  closeChatPoll,
  insertChatPollRows,
  loadChatPolls,
  replaceChatPollVote,
} from "../chat/chatPollRepository";
import { normalizeChatPollDraft } from "../chat/chatPollModel";
import { chatUnreadMessageFactsSql, unreadSystemNotificationProjectionSql } from "../chat/chatUnreadSql";
import { publishChatChannelRealtime } from "../chat/chatChannelRealtime";
import {
  ChatPushDeliveryAttemptError,
  normalizeChatPushDeliveryResult,
  type ChatPushDeliveryResult,
} from "../chat/chatPushDeliveryModel";
import {
  E2E_NOTIFICATION_ACTOR_NAME_SQL_PATTERN,
  normalizedE2eNotificationViewerEmails,
  visibleSystemNotificationMessageSql,
} from "../notifications/notificationIsolationPolicy";
import { chatPushChannelId, sendPushToUsers } from "../push/pushService";
import { publishRealtimeChatEvent } from "../realtime/realtimeEventBus";
import { resolveRealtimeUserPresence } from "../realtime/presenceRegistry";
import { readChatSettings } from "../settings/chatSettings";
import { readImageMetadata } from "../storage/images";
import { objectStorage, ObjectStorageUploadEmptyError, ObjectStorageUploadTooLargeError } from "../storage/objectStorage";
import { avatarUrlForUser } from "../users/avatar/avatarRepository";
import { getRolePermissionKeysForScope } from "./permissionRepository";
import { runtimeScope } from "./runtimeScope";
import {
  CHAT_ATTACHMENT_TTL_MS,
  CHAT_DIRECT_MEMBER_COUNT,
  DEFAULT_PUBLIC_CHANNEL_DISPLAY_NAME,
  DEFAULT_PUBLIC_CHANNEL_NAME,
  type AttachmentRow,
  CHAT_BROADCAST_MENTION_SQL_PATTERN,
  type ChannelMemberRow,
  type ChannelRow,
  type ChatActor,
  type MessageCollectionRow,
  type MessageRow,
  type Outcome,
  type ReactionRow,
  type UserRow,
  chatAttachmentContentUrl,
  chatThreadReadThroughAt,
  displayNameForChannel,
  resolveThreadMentionRecipientIds,
  iso,
  makeChatAttachmentId,
  makeId,
  normalizeTeamRole,
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

function visibleChatMessageSql(messageSql: string, recipientUserIdParam: string, actorNamePatternParam: string, viewerEmailsParam: string) {
  return visibleSystemNotificationMessageSql({
    actorNamePatternParam,
    messageSql,
    recipientUserIdParam,
    viewerEmailsParam,
  });
}

type AcknowledgementRecipientRow = {
  acknowledged: boolean;
  message_id: string;
  requested_at: Date | string;
  requested_by_user_id: string;
  user_id: string;
};

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

async function ensureActivePublicChannelMemberships(teamId: string) {
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
      ON CONFLICT (channel_id, user_id) DO NOTHING
    `,
    [teamId, now],
  );
}

async function preparePublicChannels(teamId: string) {
  await ensureDefaultPublicChannel(teamId);
  await ensureActivePublicChannelMemberships(teamId);
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
  return rows.map((row) => toChatUser(row, resolveRealtimeUserPresence({
    lastOnlineAt: row.last_online_at,
    teamId,
    userId: row.id,
  })));
}

async function findActiveDirectChannelIdByMemberIds(teamId: string, memberIds: string[], preferredName: string) {
  const orderedMemberIds = [...memberIds].sort();
  if (orderedMemberIds.length !== CHAT_DIRECT_MEMBER_COUNT) return null;
  const { rows } = await pool.query<{ id: string }>(
    `
      WITH direct_channels AS (
        SELECT
          c.id,
          c.name,
          c.created_at,
          c.updated_at,
          array_agg(DISTINCT cm.user_id::text ORDER BY cm.user_id::text) AS member_ids,
          count(DISTINCT cm.user_id)::int AS member_count,
          count(DISTINCT msg.id)::int AS message_count,
          max(msg.created_at) AS latest_message_at
        FROM chat_channels c
        INNER JOIN chat_channel_members cm ON cm.channel_id = c.id
        LEFT JOIN chat_messages msg ON msg.channel_id = c.id
        WHERE c.team_id = $1
          AND c.type = 'direct'
          AND c.system_kind IS NULL
          AND c.archived_at IS NULL
        GROUP BY c.id
      )
      SELECT id
      FROM direct_channels
      WHERE member_count = $3
        AND member_ids = $2::text[]
      ORDER BY (name = $4) DESC, message_count DESC, latest_message_at DESC NULLS LAST, updated_at DESC, created_at ASC, id
      LIMIT 1
    `,
    [teamId, orderedMemberIds, CHAT_DIRECT_MEMBER_COUNT, preferredName],
  );
  return rows[0]?.id ?? null;
}

async function loadDisplayableChannelRows(actor: ChatActor, input: { channelId?: string } = {}) {
  const teamId = storageTeamId(actor);
  await preparePublicChannels(teamId);
  const params: unknown[] = [
    teamId,
    actor.id,
    E2E_NOTIFICATION_ACTOR_NAME_SQL_PATTERN,
    normalizedE2eNotificationViewerEmails(),
  ];
  const channelFilter = input.channelId ? "AND c.id = $5" : "";
  if (input.channelId) params.push(input.channelId);
  const { rows } = await pool.query<ChannelRow>(
    `
      WITH visible_channels AS (
        SELECT
          c.id,
          c.team_id,
          c.type,
          c.integration_provider,
          c.system_kind,
          c.name,
          c.system_recipient_user_id,
          c.project_id,
          p.name AS project_name,
          c.display_name,
          c.purpose,
          c.header,
          c.created_by,
          c.archived_by,
          c.created_at,
          c.updated_at,
          c.archived_at,
          m.favorite AS current_favorite,
          (
            SELECT count(*)::int
            FROM chat_channel_members cm
            WHERE cm.channel_id = c.id
          ) AS member_count,
          (
            SELECT count(*)::int
            FROM chat_messages msg
            WHERE msg.channel_id = c.id
              AND ${visibleChatMessageSql("msg", "$2", "$3", "$4")}
          ) AS message_count,
          (
            SELECT string_agg(cm.user_id::text, ',' ORDER BY cm.user_id::text)
            FROM chat_channel_members cm
            WHERE cm.channel_id = c.id
          ) AS member_key,
          (
            SELECT max(msg.created_at)
            FROM chat_messages msg
            WHERE msg.channel_id = c.id
              AND msg.deleted_at IS NULL
              AND ${visibleChatMessageSql("msg", "$2", "$3", "$4")}
          ) AS latest_message_at
        FROM chat_channels c
        INNER JOIN chat_channel_members m ON m.channel_id = c.id AND m.user_id = $2
        LEFT JOIN projects p ON p.id = c.project_id AND p.team_id = c.team_id
        WHERE c.team_id = $1
          AND c.archived_at IS NULL
          ${channelFilter}
      ),
      ranked_channels AS (
        SELECT
          *,
          row_number() OVER (
            PARTITION BY team_id, type, lower(display_name)
            ORDER BY (message_count > 0) DESC, updated_at DESC, id
          ) AS empty_duplicate_rank,
          row_number() OVER (
            PARTITION BY team_id, type, member_key
            ORDER BY (COALESCE(name, '') LIKE 'dm-%') DESC, message_count DESC, latest_message_at DESC NULLS LAST, updated_at DESC, id
          ) AS direct_duplicate_rank
        FROM visible_channels
      )
      SELECT id, team_id, type, name, integration_provider, system_kind, system_recipient_user_id, project_id, project_name, display_name, purpose, header, created_by, archived_by, created_at, updated_at, archived_at
      FROM ranked_channels
      WHERE NOT (type = 'direct' AND system_kind IS NULL AND member_count <> 2)
        AND NOT (type = 'direct' AND system_kind IS NULL AND direct_duplicate_rank > 1)
        AND NOT (type = 'public' AND message_count = 0 AND empty_duplicate_rank > 1)
      ORDER BY current_favorite DESC, type, updated_at DESC, lower(display_name)
    `,
    params,
  );
  return rows;
}

async function listVisibleChannelRows(actor: ChatActor) {
  return loadDisplayableChannelRows(actor);
}

async function loadMembers(channelIds: string[]) {
  if (channelIds.length === 0) return new Map<string, ChatChannelMember[]>();
  const { rows } = await pool.query<ChannelMemberRow>(
    `
      SELECT m.channel_id, m.user_id, m.role, m.favorite, m.muted, m.manually_unread,
             m.last_viewed_at, m.last_read_at, m.last_read_message_id, m.joined_at
      FROM chat_channel_members m
      INNER JOIN chat_channels c ON c.id = m.channel_id
      LEFT JOIN team_members tm ON tm.team_id = c.team_id AND tm.user_id = m.user_id
      LEFT JOIN users u ON u.id = m.user_id
      WHERE m.channel_id = ANY($1::text[])
        AND (
          c.type <> 'public'
          OR (tm.user_id IS NOT NULL AND COALESCE(u.status, 'active') = 'active')
        )
      ORDER BY m.channel_id ASC, m.joined_at ASC, m.user_id ASC
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

async function loadUsersByIds(teamId: string, userIds: string[]) {
  const uniqueIds = Array.from(new Set(userIds.filter(Boolean)));
  if (uniqueIds.length === 0) return new Map<string, ChatUser>();
  const { rows } = await pool.query<UserRow>(
    `
      SELECT u.id, u.name, u.email, u.status, u.last_online_at, u.avatar_object_key, u.avatar_updated_at, COALESCE(tm.role, 'member') AS role
      FROM users u
      LEFT JOIN team_members tm ON tm.user_id = u.id AND tm.team_id = $2
      WHERE u.id = ANY($1::uuid[])
    `,
    [uniqueIds, teamId],
  );
  return new Map(rows.map((row) => [row.id, toChatUser(row, resolveRealtimeUserPresence({
    lastOnlineAt: row.last_online_at,
    teamId,
    userId: row.id,
  }))]));
}

async function loadChannelReadModel(channelIds: string[], actor: ChatActor) {
  const empty = {
    lastMessageAt: new Map<string, string | null>(),
    lastMessagePreview: new Map<string, string | null>(),
    mainMentionCounts: new Map<string, number>(),
    mentionCounts: new Map<string, number>(),
    threadMentionCounts: new Map<string, number>(),
    threadReadAt: new Map<string, string | null>(),
    threadUnreadCounts: new Map<string, number>(),
    unreadCounts: new Map<string, number>(),
  };
  if (channelIds.length === 0) return empty;

  const [lastMessages, unreadFacts, threadReadAt] = await Promise.all([
    pool.query<{ body: string; channel_id: string; created_at: Date | string }>(
      `
        SELECT DISTINCT ON (channel_id) channel_id, body, created_at
        FROM chat_messages m
        WHERE m.channel_id = ANY($1::text[])
          AND m.deleted_at IS NULL
          AND ${visibleChatMessageSql("m", "$2", "$3", "$4")}
        ORDER BY channel_id, created_at DESC
      `,
      [channelIds, actor.id, E2E_NOTIFICATION_ACTOR_NAME_SQL_PATTERN, normalizedE2eNotificationViewerEmails()],
    ),
    pool.query<{
      channel_id: string;
      main_mention_count: number;
      mention_count: number;
      message_count: number;
      thread_mention_count: number;
      thread_unread_count: number;
    }>(
      `
        WITH unread_channels AS (
          SELECT id, type, system_kind
          FROM chat_channels
          WHERE id = ANY($1::text[])
        ),
        unread_message_facts AS (
          ${chatUnreadMessageFactsSql({
            actorNamePatternParam: "$5",
            broadcastMentionParam: "$4",
            channelRelation: "unread_channels",
            currentUserMentionParam: "$3",
            userIdParam: "$2",
            viewerEmailsParam: "$6",
          })}
        )
        SELECT
          channel_id,
          count(*) FILTER (WHERE is_main)::int AS message_count,
          count(*) FILTER (
            WHERE is_main AND (mentions_current_user OR mentions_everyone)
          )::int AS main_mention_count,
          count(*) FILTER (
            WHERE mentions_current_user OR mentions_everyone
          )::int AS mention_count,
          count(*) FILTER (
            WHERE NOT is_main AND (mentions_current_user OR mentions_everyone)
          )::int AS thread_mention_count,
          count(DISTINCT root_message_id) FILTER (WHERE NOT is_main)::int AS thread_unread_count
        FROM unread_message_facts
        GROUP BY channel_id
      `,
      [
        channelIds,
        actor.id,
        `%orf-user:${actor.id}%`,
        CHAT_BROADCAST_MENTION_SQL_PATTERN,
        E2E_NOTIFICATION_ACTOR_NAME_SQL_PATTERN,
        normalizedE2eNotificationViewerEmails(),
      ],
    ),
    pool.query<{ channel_id: string; read_at: Date | string | null }>(
      `
        SELECT root.channel_id, max(f.updated_at) AS read_at
        FROM chat_thread_follows f
        INNER JOIN chat_messages root ON root.id = f.root_message_id
          AND root.root_message_id IS NULL
        WHERE f.user_id = $2
          AND root.channel_id = ANY($1::text[])
        GROUP BY root.channel_id
      `,
      [channelIds, actor.id],
    ),
  ]);

  for (const row of lastMessages.rows) {
    empty.lastMessageAt.set(row.channel_id, iso(row.created_at));
    empty.lastMessagePreview.set(row.channel_id, previewText(row.body));
  }
  for (const row of unreadFacts.rows) {
    empty.unreadCounts.set(row.channel_id, Number(row.message_count));
    empty.mainMentionCounts.set(row.channel_id, Number(row.main_mention_count));
    empty.mentionCounts.set(row.channel_id, Number(row.mention_count));
    empty.threadMentionCounts.set(row.channel_id, Number(row.thread_mention_count));
    empty.threadUnreadCounts.set(row.channel_id, Number(row.thread_unread_count));
  }
  for (const row of threadReadAt.rows) empty.threadReadAt.set(row.channel_id, iso(row.read_at));
  return empty;
}

async function buildChannels(rows: ChannelRow[], actor: ChatActor): Promise<ChatChannel[]> {
  const channelIds = rows.map((row) => row.id);
  const teamId = storageTeamId(actor);
  const membersByChannel = await loadMembers(channelIds);
  const allMemberIds = Array.from(new Set(Array.from(membersByChannel.values()).flat().map((member) => member.userId)));
  const [usersById, readModel] = await Promise.all([
    loadUsersByIds(teamId, allMemberIds),
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
      integrationProvider: row.integration_provider,
      systemKind: row.system_kind,
      systemRecipientUserId: row.system_recipient_user_id,
      projectId: row.project_id,
      projectName: row.project_name,
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
      mainMentionCount: readModel.mainMentionCounts.get(row.id) ?? 0,
      mentionCount: readModel.mentionCounts.get(row.id) ?? 0,
      threadMentionCount: readModel.threadMentionCounts.get(row.id) ?? 0,
      threadReadAt: readModel.threadReadAt.get(row.id) ?? null,
      threadUnreadCount: readModel.threadUnreadCounts.get(row.id) ?? 0,
      lastMessageAt: readModel.lastMessageAt.get(row.id) ?? null,
      lastMessagePreview: readModel.lastMessagePreview.get(row.id) ?? null,
    };
  });
}

async function getVisibleChannel(actor: ChatActor, channelId: string): Promise<ChatChannel | null> {
  const rows = await loadDisplayableChannelRows(actor, { channelId });
  const [channel] = await buildChannels(rows, actor);
  return channel ?? null;
}

export async function getVisibleChatChannel(actor: ChatActor, channelId: string): Promise<ChatChannel | null> {
  return getVisibleChannel(actor, channelId);
}

async function hasReadableChannel(actor: ChatActor, channelId: string) {
  const { rows } = await pool.query<{ id: string }>(
    `
      WITH readable_channel AS (
        SELECT
          c.id,
          c.type,
          c.system_kind,
          (
            SELECT count(*)::int
            FROM chat_channel_members member_count
            WHERE member_count.channel_id = c.id
          ) AS member_count
        FROM chat_channels c
        INNER JOIN chat_channel_members actor_membership ON actor_membership.channel_id = c.id AND actor_membership.user_id = $2
        WHERE c.team_id = $1
          AND c.id = $3
          AND c.archived_at IS NULL
        LIMIT 1
      )
      SELECT id
      FROM readable_channel
      WHERE NOT (type = 'direct' AND system_kind IS NULL AND member_count <> 2)
      LIMIT 1
    `,
    [storageTeamId(actor), actor.id, channelId],
  );
  return rows.length > 0;
}

async function getReadableChannelMember(actor: ChatActor, channelId: string) {
  if (!(await hasReadableChannel(actor, channelId))) return null;
  return getChannelMember(channelId, actor.id);
}

async function getChannelRow(actor: ChatActor, channelId: string) {
  const teamId = storageTeamId(actor);
  const { rows } = await pool.query<ChannelRow>(
    `
      SELECT c.id, c.team_id, c.type, c.name, c.integration_provider, c.system_kind, c.system_recipient_user_id, c.project_id, p.name AS project_name,
             c.display_name, c.purpose, c.header, c.created_by, c.archived_by, c.created_at, c.updated_at, c.archived_at
      FROM chat_channels c
      LEFT JOIN projects p ON p.id = c.project_id AND p.team_id = c.team_id
      WHERE c.team_id = $1 AND c.id = $2
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

async function chatActorForPushRecipient(teamId: string, userId: string): Promise<ChatActor | null> {
  const scope = runtimeScope(teamId);
  const { rows } = await pool.query<{ id: string; name: string; role: string }>(
    `
      SELECT u.id, u.name, tm.role
      FROM team_members tm
      INNER JOIN users u ON u.id = tm.user_id
      WHERE tm.team_id = $1
        AND tm.user_id = $2
        AND COALESCE(u.status, 'active') = 'active'
      LIMIT 1
    `,
    [teamId, userId],
  );
  const row = rows[0];
  if (!row) return null;

  const role = normalizeTeamRole(row.role);
  const permissions = role === "admin" ? [] : await getRolePermissionKeysForScope(scope, role);
  const has = (key: PermissionKey) => role === "admin" || permissions.includes(key);
  if (!has("chat.read")) return null;

  return {
    id: row.id,
    name: row.name,
    role,
    scope,
    canRead: true,
    canWrite: has("chat.write"),
    canCreatePrivateChannel: has("chat.channel.create"),
    canCreatePublicChannel: has("chat.channel.manage"),
    canManageAnyChannel: has("chat.channel.manage"),
    canManageAnyMembers: has("chat.member.manage"),
  };
}

function chatPushRecipientIds(input: { actorUserId: string; channel: ChatChannel; recipientUserIds: string[] }) {
  const activeRecipients = new Set(input.recipientUserIds.filter((id) => id !== input.actorUserId));
  return input.channel.members
    .filter((member) => activeRecipients.has(member.userId) && !member.muted)
    .map((member) => member.userId);
}

async function sendChatMessagePush(input: {
  authorName: string;
  authorUserId: string;
  channel: ChatChannel;
  message: ChatMessage;
  recipientUserIds: string[];
  rootMessageId?: string | null;
  teamId: string;
}) {
  const recipientUserIds = chatPushRecipientIds({
    actorUserId: input.authorUserId,
    channel: input.channel,
    recipientUserIds: input.recipientUserIds,
  }).filter((userId) => userId !== input.message.system?.actorUserId);
  if (recipientUserIds.length === 0) return null;

  const preview = chatNotificationPreviewText(input.message);
  const title = input.message.rootMessageId
    ? `回复：${input.channel.type === "direct" ? input.authorName : input.channel.displayName || "聊天"}`
    : input.channel.type === "direct"
      ? input.authorName
      : input.channel.displayName || "聊天";
  const body = input.channel.type === "direct" ? preview : `${input.authorName}: ${preview}`;
  const targetPath = chatMessageTargetPath({
    channelId: input.channel.id,
    messageId: input.message.id,
    threadRootMessageId: input.message.rootMessageId,
  });

  return sendPushToUsers({
    body,
    channelId: chatPushChannelId,
    collapseKey: `chat-${input.channel.id}`,
    data: {
      channelId: input.channel.id,
      messageId: input.message.id,
      rootMessageId: input.rootMessageId ?? "",
    },
    kind: "chat.message.created",
    recipientUserIds,
    tag: input.message.id,
    targetPath,
    teamId: input.teamId,
    title,
  });
}

const notApplicablePushDeliveryResult = (): ChatPushDeliveryResult => ({
  failureCount: 0,
  outcome: "not_applicable",
  successCount: 0,
  targetCount: 0,
});

const pushDisabledDeliveryResult = (): ChatPushDeliveryResult => ({
  failureCount: 0,
  outcome: "push_disabled",
  successCount: 0,
  targetCount: 0,
});

export async function deliverChatPushDelivery(claim: ChatPushDeliveryClaim): Promise<ChatPushDeliveryResult> {
  const recipientActor = await chatActorForPushRecipient(claim.teamId, claim.recipientUserId);
  if (!recipientActor) return notApplicablePushDeliveryResult();
  const [channel, message] = await Promise.all([
    getVisibleChannel(recipientActor, claim.channelId),
    getMessageById(recipientActor, claim.messageId),
  ]);
  if (!channel || !message || message.deletedAt) return notApplicablePushDeliveryResult();

  const membership = channel.members.find((member) => member.userId === claim.recipientUserId);
  if (!membership || membership.muted || claim.recipientUserId === message.authorUserId || claim.recipientUserId === message.system?.actorUserId) {
    return notApplicablePushDeliveryResult();
  }
  const delivery = await sendChatMessagePush({
    authorName: message.authorName,
    authorUserId: message.authorUserId,
    channel,
    message,
    recipientUserIds: [claim.recipientUserId],
    rootMessageId: message.rootMessageId,
    teamId: claim.teamId,
  });
  if (!delivery || delivery.availability === "disabled") return pushDisabledDeliveryResult();
  if (delivery.availability === "no_devices") {
    return { failureCount: 0, outcome: "no_push_device", successCount: 0, targetCount: 0 };
  }
  const retryableFailureCount = Math.max(0, delivery.failureCount - delivery.invalidTokenCount);
  if (delivery.successCount === 0 && retryableFailureCount > 0) {
    throw new ChatPushDeliveryAttemptError(
      `Push provider rejected ${retryableFailureCount} retryable device delivery attempt(s).`,
      {
        failureCount: delivery.failureCount,
        successCount: delivery.successCount,
        targetCount: delivery.targetDeviceCount,
      },
    );
  }
  return normalizeChatPushDeliveryResult({
    failureCount: delivery.failureCount,
    outcome: delivery.successCount === 0
      ? "push_rejected"
      : delivery.failureCount > 0
        ? "push_partially_accepted"
        : "push_accepted",
    successCount: delivery.successCount,
    targetCount: delivery.targetDeviceCount,
  });
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

async function loadAcknowledgements(messageIds: string[], actor: ChatActor) {
  if (messageIds.length === 0) return new Map<string, ChatMessageAcknowledgement>();
  const { rows } = await pool.query<AcknowledgementRecipientRow>(
    `
      SELECT
        request.message_id,
        request.requested_by_user_id,
        request.requested_at,
        recipient.user_id,
        (
          EXISTS (
            SELECT 1
            FROM chat_message_reactions reaction
            WHERE reaction.message_id = request.message_id
              AND reaction.user_id = recipient.user_id
          )
          OR EXISTS (
            SELECT 1
            FROM chat_messages reply
            WHERE reply.team_id = request.team_id
              AND reply.channel_id = request.channel_id
              AND reply.root_message_id = request.message_id
              AND reply.author_user_id = recipient.user_id
              AND reply.deleted_at IS NULL
          )
        ) AS acknowledged
      FROM chat_message_ack_requests request
      INNER JOIN chat_message_ack_recipients recipient
        ON recipient.message_id = request.message_id
      WHERE request.message_id = ANY($1::text[])
      ORDER BY request.requested_at ASC, recipient.assigned_at ASC, recipient.user_id ASC
    `,
    [messageIds],
  );

  const result = new Map<string, ChatMessageAcknowledgement>();
  for (const row of rows) {
    const acknowledgement = result.get(row.message_id) ?? {
      acknowledgedUserIds: [],
      currentUserAcknowledged: false,
      currentUserPending: false,
      pendingUserIds: [],
      recipientUserIds: [],
      requestedAt: iso(row.requested_at) ?? nowIso(),
      requestedByUserId: row.requested_by_user_id,
    };
    acknowledgement.recipientUserIds.push(row.user_id);
    if (row.acknowledged) {
      acknowledgement.acknowledgedUserIds.push(row.user_id);
      if (row.user_id === actor.id) acknowledgement.currentUserAcknowledged = true;
    } else {
      acknowledgement.pendingUserIds.push(row.user_id);
      if (row.user_id === actor.id) acknowledgement.currentUserPending = true;
    }
    result.set(row.message_id, acknowledgement);
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
  const [attachmentsByMessage, reactionsByMessage, acknowledgementByMessage, pollsByMessage, replySummaries, collectionsByMessage] = await Promise.all([
    loadAttachments(messageIds),
    loadReactions(messageIds, actor),
    loadAcknowledgements(messageIds, actor),
    loadChatPolls(messageIds, actor.id),
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
      source: row.source ?? "user",
      system: row.source === "system" ? row.system_metadata ?? {} : null,
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
      acknowledgement: deleted ? null : acknowledgementByMessage.get(row.id) ?? null,
      poll: deleted ? null : pollsByMessage.get(row.id) ?? null,
    };
  });
}

async function getMessageById(actor: ChatActor, messageId: string) {
  const teamId = storageTeamId(actor);
  const { rows } = await pool.query<MessageRow>(
    `
      SELECT m.id, m.channel_id, m.author_user_id, u.name AS author_name, u.avatar_object_key AS author_avatar_object_key,
             u.avatar_updated_at AS author_avatar_updated_at, m.body, m.root_message_id, m.parent_message_id,
             m.source, m.system_metadata, m.created_at, m.updated_at, m.edited_at, m.deleted_at, m.deleted_by
      FROM chat_messages m
      INNER JOIN users u ON u.id = m.author_user_id
      WHERE m.team_id = $1
        AND m.id = $2
        AND ${visibleChatMessageSql("m", "$3", "$4", "$5")}
      LIMIT 1
    `,
    [teamId, messageId, actor.id, E2E_NOTIFICATION_ACTOR_NAME_SQL_PATTERN, normalizedE2eNotificationViewerEmails()],
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
             m.source, m.system_metadata, m.created_at, m.updated_at, m.edited_at, m.deleted_at, m.deleted_by
      FROM chat_messages m
      INNER JOIN users u ON u.id = m.author_user_id
      WHERE m.team_id = $1
        AND m.id = $2
        AND ${visibleChatMessageSql("m", "$3", "$4", "$5")}
      LIMIT 1
    `,
    [teamId, messageId, actor.id, E2E_NOTIFICATION_ACTOR_NAME_SQL_PATTERN, normalizedE2eNotificationViewerEmails()],
  );
  return rows[0] ?? null;
}

export async function getChatBootstrap(actor: ChatActor): Promise<ChatBootstrap> {
  const settings = await readChatSettings();
  const teamId = storageTeamId(actor);
  if (!actor.canRead) {
    return {
      channels: [],
      settings,
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

  const [users, channelRows] = await Promise.all([listActiveTeamUsers(teamId), listVisibleChannelRows(actor)]);
  const channels = await buildChannels(channelRows, actor);
  return {
    channels,
    settings,
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

export async function listChatUsers(actor: ChatActor): Promise<ChatUser[]> {
  if (!actor.canRead) {
    return [];
  }
  return listActiveTeamUsers(storageTeamId(actor));
}

export async function listProjectChatChannels(
  projectId: string,
  actor: ChatActor,
): Promise<Outcome<{ channels: ProjectChatChannel[] }>> {
  if (!actor.canRead) return { status: "forbidden" };
  const normalizedProjectId = projectId.trim();
  if (!normalizedProjectId) return { status: "invalid" };

  const teamId = storageTeamId(actor);
  await preparePublicChannels(teamId);
  const { rows } = await pool.query<{
    display_name: string;
    id: string;
    member_count: number | string;
    project_id: string;
    project_name: string | null;
    type: "public" | "private";
    updated_at: Date | string;
  }>(
    `
      SELECT
        c.id,
        c.type,
        c.display_name,
        c.project_id,
        p.name AS project_name,
        c.updated_at,
        (
          SELECT count(*)::int
          FROM chat_channel_members cm
          WHERE cm.channel_id = c.id
        ) AS member_count
      FROM chat_channels c
      INNER JOIN chat_channel_members m ON m.channel_id = c.id AND m.user_id = $3
      LEFT JOIN projects p ON p.id = c.project_id AND p.team_id = c.team_id
      WHERE c.team_id = $1
        AND c.project_id = $2
        AND c.system_kind IS NULL
        AND c.type IN ('public', 'private')
        AND c.archived_at IS NULL
      ORDER BY c.updated_at DESC, c.created_at ASC, c.id
    `,
    [teamId, normalizedProjectId, actor.id],
  );

  return ok({
    channels: rows.map((row) => ({
      displayName: row.display_name,
      id: row.id,
      memberCount: Number(row.member_count ?? 0),
      projectId: row.project_id,
      projectName: row.project_name,
      type: row.type,
      updatedAt: iso(row.updated_at) ?? nowIso(),
    })),
  });
}

export async function getChatUnreadSummary(actor: ChatActor): Promise<ChatUnreadSummary> {
  if (!actor.canRead) {
    return {
      actionableMessageUnreadCount: 0,
      ackRequiredCount: 0,
      directMessageUnreadCount: 0,
      mainMentionCount: 0,
      mentionCount: 0,
      messageUnreadCount: 0,
      nextTarget: null,
      threadMentionCount: 0,
      threadUnreadCount: 0,
      totalUnreadCount: 0,
      unreadChannelCount: 0,
    };
  }

  const teamId = storageTeamId(actor);
  await preparePublicChannels(teamId);
  const { rows } = await pool.query<{
    actionable_message_unread_count: number | string | null;
    ack_required_count: number | string | null;
    direct_message_unread_count: number | string | null;
    main_mention_count: number | string | null;
    mention_count: number | string | null;
    message_unread_count: number | string | null;
    thread_mention_count: number | string | null;
    thread_unread_count: number | string | null;
    unread_channel_count: number | string | null;
    target_channel_id: string | null;
    target_message_id: string | null;
    target_reason: "ack_required" | "direct" | "mention_me" | "mention_all" | "system" | "normal" | null;
    target_root_message_id: string | null;
  }>(
    `
      WITH visible_channels AS (
        SELECT
          c.id,
          c.team_id,
          c.type,
          c.system_kind,
          c.name,
          c.display_name,
          c.updated_at,
          m.manually_unread,
          (
            SELECT count(*)::int
            FROM chat_channel_members cm
            WHERE cm.channel_id = c.id
          ) AS member_count,
          (
            SELECT count(*)::int
            FROM chat_messages msg
            WHERE msg.channel_id = c.id
          ) AS message_count,
          (
            SELECT string_agg(cm.user_id::text, ',' ORDER BY cm.user_id::text)
            FROM chat_channel_members cm
            WHERE cm.channel_id = c.id
          ) AS member_key,
          (
            SELECT max(msg.created_at)
            FROM chat_messages msg
            WHERE msg.channel_id = c.id
              AND msg.deleted_at IS NULL
          ) AS latest_message_at
        FROM chat_channels c
        INNER JOIN chat_channel_members m ON m.channel_id = c.id AND m.user_id = $2
        WHERE c.team_id = $1
          AND c.archived_at IS NULL
      ),
      ranked_channels AS (
        SELECT
          *,
          row_number() OVER (
            PARTITION BY team_id, type, lower(display_name)
            ORDER BY (message_count > 0) DESC, updated_at DESC, id
          ) AS empty_duplicate_rank,
          row_number() OVER (
            PARTITION BY team_id, type, member_key
            ORDER BY (COALESCE(name, '') LIKE 'dm-%') DESC, message_count DESC, latest_message_at DESC NULLS LAST, updated_at DESC, id
          ) AS direct_duplicate_rank
        FROM visible_channels
      ),
      displayable_channels AS (
        SELECT id, manually_unread, system_kind, type
        FROM ranked_channels
        WHERE NOT (type = 'direct' AND system_kind IS NULL AND member_count <> 2)
          AND NOT (type = 'direct' AND system_kind IS NULL AND direct_duplicate_rank > 1)
          AND NOT (type = 'public' AND message_count = 0 AND empty_duplicate_rank > 1)
      ),
      unread_message_facts AS (
        ${chatUnreadMessageFactsSql({
          actorNamePatternParam: "$5",
          broadcastMentionParam: "$4",
          channelRelation: "displayable_channels",
          currentUserMentionParam: "$3",
          userIdParam: "$2",
          viewerEmailsParam: "$6",
        })}
      ),
      unread_by_channel AS (
        SELECT
          channel_id,
          count(*) FILTER (WHERE is_main)::int AS message_count,
          count(*) FILTER (WHERE is_main AND is_direct)::int AS direct_message_count,
          count(*) FILTER (
            WHERE is_main AND (is_direct OR mentions_current_user OR mentions_everyone)
          )::int AS actionable_message_count,
          count(*) FILTER (
            WHERE is_main AND (mentions_current_user OR mentions_everyone)
          )::int AS main_mention_count,
          count(*) FILTER (
            WHERE mentions_current_user OR mentions_everyone
          )::int AS mention_count,
          count(*) FILTER (
            WHERE NOT is_main AND (mentions_current_user OR mentions_everyone)
          )::int AS thread_mention_count,
          count(DISTINCT root_message_id) FILTER (WHERE NOT is_main)::int AS thread_count
        FROM unread_message_facts
        GROUP BY channel_id
      ),
      pending_ack_facts AS (
        SELECT
          m.channel_id,
          m.id AS message_id,
          NULL::text AS root_message_id,
          request.requested_at AS created_at,
          0 AS priority,
          'ack_required' AS reason
        FROM chat_message_ack_recipients recipient
        INNER JOIN chat_message_ack_requests request
          ON request.message_id = recipient.message_id
        INNER JOIN chat_messages m
          ON m.id = request.message_id
         AND m.team_id = request.team_id
         AND m.channel_id = request.channel_id
        INNER JOIN displayable_channels dc ON dc.id = m.channel_id
        WHERE recipient.user_id = $2
          AND m.root_message_id IS NULL
          AND m.deleted_at IS NULL
          AND ${visibleChatMessageSql("m", "$2", "$5", "$6")}
          AND NOT EXISTS (
            SELECT 1
            FROM chat_message_reactions reaction
            WHERE reaction.message_id = request.message_id
              AND reaction.user_id = recipient.user_id
          )
          AND NOT EXISTS (
            SELECT 1
            FROM chat_messages reply
            WHERE reply.team_id = request.team_id
              AND reply.channel_id = request.channel_id
              AND reply.root_message_id = request.message_id
              AND reply.author_user_id = recipient.user_id
              AND reply.deleted_at IS NULL
          )
      ),
      ack_by_channel AS (
        SELECT channel_id, count(*)::int AS ack_required_count
        FROM pending_ack_facts
        GROUP BY channel_id
      ),
      manual_unread_target_candidates AS (
        SELECT
          dc.id AS channel_id,
          latest.id AS message_id,
          NULL::text AS root_message_id,
          latest.created_at,
          CASE
            WHEN dc.type = 'direct' AND dc.system_kind IS NULL THEN 1
            WHEN dc.system_kind IS NOT NULL OR latest.source = 'system' THEN 4
            ELSE 5
          END AS priority,
          CASE
            WHEN dc.type = 'direct' AND dc.system_kind IS NULL THEN 'direct'
            WHEN dc.system_kind IS NOT NULL OR latest.source = 'system' THEN 'system'
            ELSE 'normal'
          END AS reason
        FROM displayable_channels dc
        INNER JOIN LATERAL (
          SELECT m.id, m.created_at, m.source
          FROM chat_messages m
          WHERE m.channel_id = dc.id
            AND m.root_message_id IS NULL
            AND m.deleted_at IS NULL
            AND ${visibleChatMessageSql("m", "$2", "$5", "$6")}
          ORDER BY m.created_at DESC, m.id DESC
          LIMIT 1
        ) latest ON true
        WHERE dc.manually_unread
          AND NOT EXISTS (
            SELECT 1 FROM unread_message_facts unread WHERE unread.channel_id = dc.id
          )
      ),
      next_unread_target AS (
        SELECT channel_id, message_id, root_message_id, reason
        FROM (
          SELECT channel_id, message_id, root_message_id, created_at, priority, reason
          FROM unread_message_facts
          UNION ALL
          SELECT channel_id, message_id, root_message_id, created_at, priority, reason
          FROM pending_ack_facts
          UNION ALL
          SELECT channel_id, message_id, root_message_id, created_at, priority, reason
          FROM manual_unread_target_candidates
        ) candidates
        ORDER BY priority ASC, created_at ASC, message_id ASC
        LIMIT 1
      ),
      channel_unread AS (
        SELECT
          dc.id,
          dc.system_kind,
          dc.type,
          CASE
            WHEN dc.manually_unread AND COALESCE(unread.message_count, 0) = 0 THEN 1
            ELSE COALESCE(unread.message_count, 0)
          END AS message_count,
          CASE
            WHEN dc.type = 'direct' AND dc.system_kind IS NULL AND dc.manually_unread AND COALESCE(unread.direct_message_count, 0) = 0 THEN 1
            ELSE COALESCE(unread.direct_message_count, 0)
          END AS direct_message_count,
          CASE
            WHEN dc.type = 'direct' AND dc.system_kind IS NULL AND dc.manually_unread AND COALESCE(unread.actionable_message_count, 0) = 0 THEN 1
            ELSE COALESCE(unread.actionable_message_count, 0)
          END AS actionable_message_count,
          COALESCE(unread.main_mention_count, 0) AS main_mention_count,
          COALESCE(unread.mention_count, 0) AS mention_count,
          COALESCE(unread.thread_mention_count, 0) AS thread_mention_count,
          COALESCE(unread.thread_count, 0) AS thread_count,
          COALESCE(ack.ack_required_count, 0) AS ack_required_count
        FROM displayable_channels dc
        LEFT JOIN unread_by_channel unread ON unread.channel_id = dc.id
        LEFT JOIN ack_by_channel ack ON ack.channel_id = dc.id
      )
      SELECT
        COALESCE(sum(actionable_message_count), 0)::int AS actionable_message_unread_count,
        COALESCE(sum(ack_required_count), 0)::int AS ack_required_count,
        COALESCE(sum(direct_message_count), 0)::int AS direct_message_unread_count,
        COALESCE(sum(message_count), 0)::int AS message_unread_count,
        COALESCE(sum(main_mention_count), 0)::int AS main_mention_count,
        COALESCE(sum(mention_count), 0)::int AS mention_count,
        COALESCE(sum(thread_mention_count), 0)::int AS thread_mention_count,
        COALESCE(sum(thread_count), 0)::int AS thread_unread_count,
        count(*) FILTER (WHERE message_count > 0 OR thread_count > 0)::int AS unread_channel_count,
        (SELECT channel_id FROM next_unread_target) AS target_channel_id,
        (SELECT message_id FROM next_unread_target) AS target_message_id,
        (SELECT root_message_id FROM next_unread_target) AS target_root_message_id,
        (SELECT reason FROM next_unread_target) AS target_reason
      FROM channel_unread
    `,
    [
      teamId,
      actor.id,
      `%orf-user:${actor.id}%`,
      CHAT_BROADCAST_MENTION_SQL_PATTERN,
      E2E_NOTIFICATION_ACTOR_NAME_SQL_PATTERN,
      normalizedE2eNotificationViewerEmails(),
    ],
  );
  const row = rows[0];
  const messageUnreadCount = Number(row?.message_unread_count ?? 0);
  const threadUnreadCount = Number(row?.thread_unread_count ?? 0);
  const nextTarget = row?.target_channel_id && row.target_message_id && row.target_reason
    ? {
        channelId: row.target_channel_id,
        messageId: row.target_message_id,
        reason: row.target_reason,
        surface: row.target_root_message_id ? "threadMention" as const : "main" as const,
        targetPath: chatMessageTargetPath({
          channelId: row.target_channel_id,
          messageId: row.target_message_id,
          threadRootMessageId: row.target_root_message_id,
        }),
        threadRootMessageId: row.target_root_message_id,
      }
    : null;
  return {
    actionableMessageUnreadCount: Number(row?.actionable_message_unread_count ?? 0),
    ackRequiredCount: Number(row?.ack_required_count ?? 0),
    directMessageUnreadCount: Number(row?.direct_message_unread_count ?? 0),
    mainMentionCount: Number(row?.main_mention_count ?? 0),
    mentionCount: Number(row?.mention_count ?? 0),
    messageUnreadCount,
    nextTarget,
    threadMentionCount: Number(row?.thread_mention_count ?? 0),
    threadUnreadCount,
    totalUnreadCount: messageUnreadCount + threadUnreadCount,
    unreadChannelCount: Number(row?.unread_channel_count ?? 0),
  };
}

export async function listChatMessages(input: { before?: string; channelId: string; limit?: number }, actor: ChatActor): Promise<Outcome<{ messages: ChatMessage[] }>> {
  if (!actor.canRead) return { status: "forbidden" };
  if (!(await hasReadableChannel(actor, input.channelId))) return { status: "notFound" };

  const limit = Math.max(1, Math.min(100, input.limit ?? 60));
  const params: unknown[] = [
    storageTeamId(actor),
    input.channelId,
    limit,
    actor.id,
    E2E_NOTIFICATION_ACTOR_NAME_SQL_PATTERN,
    normalizedE2eNotificationViewerEmails(),
  ];
  const beforeClause = input.before ? "AND m.created_at < $7" : "";
  if (input.before) params.push(input.before);
  const { rows } = await pool.query<MessageRow>(
    `
      SELECT *
      FROM (
        SELECT m.id, m.channel_id, m.author_user_id, u.name AS author_name, u.avatar_object_key AS author_avatar_object_key,
               u.avatar_updated_at AS author_avatar_updated_at, m.body, m.root_message_id, m.parent_message_id,
               m.source, m.system_metadata, m.created_at, m.updated_at, m.edited_at, m.deleted_at, m.deleted_by
        FROM chat_messages m
        INNER JOIN users u ON u.id = m.author_user_id
        WHERE m.team_id = $1
          AND m.channel_id = $2
          AND m.root_message_id IS NULL
          AND ${visibleChatMessageSql("m", "$4", "$5", "$6")}
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
  if (!(await hasReadableChannel(actor, input.channelId))) return { status: "notFound" };

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
               m.source, m.system_metadata, m.created_at, m.updated_at, m.edited_at, m.deleted_at, m.deleted_by,
               row_number() OVER (ORDER BY m.created_at ASC, m.id ASC) AS rn,
               count(*) OVER () AS total_count
        FROM chat_messages m
        INNER JOIN users u ON u.id = m.author_user_id
        WHERE m.team_id = $1
          AND m.channel_id = $2
          AND m.root_message_id IS NULL
          AND ${visibleChatMessageSql("m", "$5", "$6", "$7")}
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
    [
      storageTeamId(actor),
      input.channelId,
      rootMessageId,
      radius,
      actor.id,
      E2E_NOTIFICATION_ACTOR_NAME_SQL_PATTERN,
      normalizedE2eNotificationViewerEmails(),
    ],
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

async function getChatMainUnreadContext(
  input: { anchor?: { lastReadAt?: string | null; manuallyUnread: boolean }; channelId: string; limit?: number },
  actor: ChatActor,
): Promise<Outcome<ChatMessageContext>> {
  if (!actor.canRead) return { status: "forbidden" };
  const member = await getReadableChannelMember(actor, input.channelId);
  if (!member) return { status: "notFound" };

  const lastReadAt = input.anchor ? input.anchor.lastReadAt ?? null : member.lastReadAt ?? null;
  const manuallyUnread = input.anchor ? input.anchor.manuallyUnread : Boolean(member.manuallyUnread);
  const { rows } = await pool.query<{ id: string }>(
    `
      SELECT m.id
      FROM chat_messages m
      WHERE m.team_id = $1
        AND m.channel_id = $2
        AND m.root_message_id IS NULL
        AND m.deleted_at IS NULL
        AND ${visibleChatMessageSql("m", "$5", "$6", "$7")}
        AND (
          ${unreadSystemNotificationProjectionSql("m", { userIdParam: "$5" })}
          OR (
            NULLIF(m.system_metadata->>'notificationEventId', '') IS NULL
            AND ($3::timestamptz IS NULL OR m.created_at > $3::timestamptz)
            AND ($4::boolean = true OR m.author_user_id <> $5::uuid)
          )
        )
      ORDER BY m.created_at ASC, m.id ASC
      LIMIT 1
    `,
    [
      storageTeamId(actor),
      input.channelId,
      lastReadAt,
      manuallyUnread,
      actor.id,
      E2E_NOTIFICATION_ACTOR_NAME_SQL_PATTERN,
      normalizedE2eNotificationViewerEmails(),
    ],
  );
  const targetMessageId = rows[0]?.id;
  if (!targetMessageId) return { status: "notFound" };
  return getChatMessageContext({ channelId: input.channelId, limit: input.limit, messageId: targetMessageId }, actor);
}

async function findFirstUnreadThreadMention(channelId: string, actor: ChatActor) {
  const { rows } = await pool.query<{ id: string; root_message_id: string }>(
    `
      WITH unread_channels AS (
        SELECT id, type, system_kind
        FROM chat_channels
        WHERE team_id = $1 AND id = $2 AND archived_at IS NULL
      ),
      unread_message_facts AS (
        ${chatUnreadMessageFactsSql({
          actorNamePatternParam: "$6",
          broadcastMentionParam: "$5",
          channelRelation: "unread_channels",
          currentUserMentionParam: "$4",
          userIdParam: "$3",
          viewerEmailsParam: "$7",
        })}
      )
      SELECT message_id AS id, root_message_id
      FROM unread_message_facts
      WHERE NOT is_main
        AND (mentions_current_user OR mentions_everyone)
      ORDER BY created_at ASC, message_id ASC
      LIMIT 1
    `,
    [
      storageTeamId(actor),
      channelId,
      actor.id,
      `%orf-user:${actor.id}%`,
      CHAT_BROADCAST_MENTION_SQL_PATTERN,
      E2E_NOTIFICATION_ACTOR_NAME_SQL_PATTERN,
      normalizedE2eNotificationViewerEmails(),
    ],
  );
  return rows[0] ?? null;
}

export async function getChatUnreadTarget(
  input: {
    anchor?: { lastReadAt?: string | null; manuallyUnread: boolean };
    channelId: string;
    limit?: number;
    surface: "main" | "threadMention";
  },
  actor: ChatActor,
): Promise<Outcome<{ target: ChatUnreadTarget }>> {
  if (input.surface === "main") {
    const outcome = await getChatMainUnreadContext(input, actor);
    if (outcome.status !== "ok") return outcome;
    const { status: _status, ...context } = outcome;
    return ok({ target: { context, kind: "main" } });
  }

  if (!actor.canRead) return { status: "forbidden" };
  if (!(await hasReadableChannel(actor, input.channelId))) return { status: "notFound" };
  const target = await findFirstUnreadThreadMention(input.channelId, actor);
  if (!target) return { status: "notFound" };
  return ok({
    target: {
      kind: "threadMention",
      rootMessageId: target.root_message_id,
      targetMessageId: target.id,
    },
  });
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
             m.source, m.system_metadata, m.created_at, m.updated_at, m.edited_at, m.deleted_at, m.deleted_by
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

  const now = nowIso();
  const readThroughAt = chatThreadReadThroughAt(messages) ?? rootMessage.createdAt;
  const { rows: followRows } = await pool.query<{ following: boolean; read_state_changed: boolean }>(
    `
      WITH advanced_follow AS (
        INSERT INTO chat_thread_follows (root_message_id, user_id, following, last_viewed_at, updated_at)
        VALUES ($1, $2, true, $3, $4)
        ON CONFLICT (root_message_id, user_id)
        DO UPDATE SET
          last_viewed_at = EXCLUDED.last_viewed_at,
          updated_at = EXCLUDED.updated_at
        WHERE chat_thread_follows.last_viewed_at IS NULL
          OR chat_thread_follows.last_viewed_at < EXCLUDED.last_viewed_at
        RETURNING following, true AS read_state_changed
      )
      SELECT following, read_state_changed
      FROM advanced_follow
      UNION ALL
      SELECT existing.following, false AS read_state_changed
      FROM chat_thread_follows existing
      WHERE existing.root_message_id = $1
        AND existing.user_id = $2
        AND NOT EXISTS (SELECT 1 FROM advanced_follow)
      LIMIT 1
    `,
    [rootMessageId, actor.id, readThroughAt, now],
  );
  const updatedChannel = await getVisibleChannel(actor, root.channel_id);
  if (!updatedChannel) return { status: "notFound" };
  if (followRows[0]?.read_state_changed) {
    publishChatChannelRealtime({
      teamId: storageTeamId(actor),
      recipientUserIds: [actor.id],
      eventType: "read.changed",
      channelId: updatedChannel.id,
      actorUserId: actor.id,
    });
  }
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
    channel_integration_provider: ChatChannel["integrationProvider"];
    channel_name: string | null;
    channel_project_id: string | null;
    channel_project_name: string | null;
    channel_purpose: string;
    channel_system_kind: ChatChannel["systemKind"];
    channel_system_recipient_user_id: string | null;
    channel_type: ChatChannelType;
    channel_updated_at: Date | string;
    following: boolean;
    thread_last_viewed_at: Date | string | null;
    thread_unread_count: number;
  };
  const { rows } = await pool.query<ThreadSummaryRow>(
    `
      WITH effective_follows AS (
        SELECT f.root_message_id, f.user_id, f.following, f.last_viewed_at
        FROM chat_thread_follows f
        WHERE f.user_id = $2

        UNION ALL

        SELECT DISTINCT mention.root_message_id, $2::uuid, true, null::timestamptz
        FROM chat_messages mention
        INNER JOIN chat_messages mentioned_root ON mentioned_root.id = mention.root_message_id
          AND mentioned_root.team_id = mention.team_id
          AND mentioned_root.channel_id = mention.channel_id
          AND mentioned_root.root_message_id IS NULL
          AND mentioned_root.deleted_at IS NULL
        INNER JOIN chat_channels mentioned_channel ON mentioned_channel.id = mention.channel_id
          AND mentioned_channel.team_id = $1
          AND mentioned_channel.archived_at IS NULL
        INNER JOIN chat_channel_members mentioned_membership
          ON mentioned_membership.channel_id = mentioned_channel.id AND mentioned_membership.user_id = $2
        LEFT JOIN chat_thread_follows existing_follow
          ON existing_follow.root_message_id = mention.root_message_id AND existing_follow.user_id = $2
        WHERE mention.team_id = $1
          AND mention.root_message_id IS NOT NULL
          AND mention.author_user_id <> $2
          AND mention.deleted_at IS NULL
          AND existing_follow.root_message_id IS NULL
          AND (mention.body LIKE $3 OR mention.body ~* $4)
          AND ${visibleChatMessageSql("mention", "$2", "$5", "$6")}
          AND ${visibleChatMessageSql("mentioned_root", "$2", "$5", "$6")}
      ),
      unread_channels AS (
        SELECT c.id, c.type, c.system_kind
        FROM chat_channels c
        INNER JOIN chat_channel_members cm ON cm.channel_id = c.id AND cm.user_id = $2
        WHERE c.team_id = $1 AND c.archived_at IS NULL
      ),
      unread_message_facts AS (
        ${chatUnreadMessageFactsSql({
          actorNamePatternParam: "$5",
          broadcastMentionParam: "$4",
          channelRelation: "unread_channels",
          currentUserMentionParam: "$3",
          userIdParam: "$2",
          viewerEmailsParam: "$6",
        })}
      ),
      unread_threads AS (
        SELECT root_message_id, count(*)::int AS count
        FROM unread_message_facts
        WHERE NOT is_main
        GROUP BY root_message_id
      )
      SELECT root.id, root.channel_id, root.author_user_id, u.name AS author_name,
             u.avatar_object_key AS author_avatar_object_key, u.avatar_updated_at AS author_avatar_updated_at,
             root.body, root.root_message_id, root.parent_message_id,
             root.source, root.system_metadata, root.created_at, root.updated_at, root.edited_at, root.deleted_at, root.deleted_by,
             c.type AS channel_type, c.name AS channel_name, c.integration_provider AS channel_integration_provider, c.system_kind AS channel_system_kind,
             c.system_recipient_user_id AS channel_system_recipient_user_id, c.display_name AS channel_display_name,
             c.project_id AS channel_project_id, p.name AS channel_project_name, c.purpose AS channel_purpose, c.header AS channel_header, c.created_by AS channel_created_by,
             c.created_at AS channel_created_at, c.updated_at AS channel_updated_at, c.archived_at AS channel_archived_at,
             f.following, f.last_viewed_at AS thread_last_viewed_at,
             COALESCE(unread.count, 0)::int AS thread_unread_count
      FROM effective_follows f
      INNER JOIN chat_messages root ON root.id = f.root_message_id
        AND root.team_id = $1
        AND root.root_message_id IS NULL
        AND root.deleted_at IS NULL
      INNER JOIN chat_channels c ON c.id = root.channel_id
        AND c.team_id = $1
        AND c.archived_at IS NULL
      LEFT JOIN projects p ON p.id = c.project_id AND p.team_id = c.team_id
      INNER JOIN chat_channel_members cm ON cm.channel_id = c.id AND cm.user_id = $2
      INNER JOIN users u ON u.id = root.author_user_id
      LEFT JOIN unread_threads unread ON unread.root_message_id = root.id
      LEFT JOIN LATERAL (
        SELECT max(created_at) AS last_reply_at
        FROM chat_messages reply
        WHERE reply.team_id = $1
          AND reply.root_message_id = root.id
          AND reply.deleted_at IS NULL
          AND ${visibleChatMessageSql("reply", "$2", "$5", "$6")}
      ) latest_reply ON true
      WHERE f.user_id = $2
        AND f.following = true
        AND ${visibleChatMessageSql("root", "$2", "$5", "$6")}
        AND EXISTS (
          SELECT 1
          FROM chat_messages reply
          WHERE reply.team_id = $1
            AND reply.root_message_id = root.id
            AND reply.deleted_at IS NULL
            AND ${visibleChatMessageSql("reply", "$2", "$5", "$6")}
        )
      ORDER BY COALESCE(unread.count, 0) > 0 DESC,
               COALESCE(latest_reply.last_reply_at, root.created_at) DESC
      LIMIT 100
    `,
    [
      teamId,
      actor.id,
      `%orf-user:${actor.id}%`,
      CHAT_BROADCAST_MENTION_SQL_PATTERN,
      E2E_NOTIFICATION_ACTOR_NAME_SQL_PATTERN,
      normalizedE2eNotificationViewerEmails(),
    ],
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
    source: row.source,
    system_metadata: row.system_metadata,
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
    integration_provider: row.channel_integration_provider ?? null,
    project_id: row.channel_project_id,
    project_name: row.channel_project_name,
    system_kind: row.channel_system_kind ?? null,
    system_recipient_user_id: row.channel_system_recipient_user_id,
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
  input: {
    displayName: string;
    header?: string;
    integrationProvider?: ChatChannel["integrationProvider"];
    memberUserIds?: string[];
    name?: string;
    projectId?: string | null;
    purpose?: string;
    type: "public" | "private";
  },
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
  const projectId = input.projectId?.trim() || null;
  if (projectId) {
    const project = await pool.query<{ id: string }>(
      "SELECT id FROM projects WHERE team_id = $1 AND id = $2 LIMIT 1",
      [teamId, projectId],
    );
    if (!project.rows[0]) return { status: "invalid" };
  }

  try {
    await pool.query(
      `
        INSERT INTO chat_channels (id, team_id, type, name, integration_provider, display_name, purpose, header, project_id, created_by, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)
      `,
      [
        id,
        teamId,
        input.type,
        name,
        input.integrationProvider ?? null,
        displayName,
        input.purpose?.trim() ?? "",
        input.header?.trim() ?? "",
        projectId,
        actor.id,
        now,
      ],
    );
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "23505") {
      return { status: "conflict" };
    }
    throw error;
  }

  if (input.type === "public") {
    await ensureActivePublicChannelMemberships(teamId);
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
  publishChatChannelRealtime({
    eventType: "channel.created",
    teamId,
    channelId: id,
    actorUserId: actor.id,
    recipientUserIds: recipients,
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

export async function createDirectChannel(input: { userIds: string[] }, actor: ChatActor): Promise<Outcome<{ channel: ChatChannel }>> {
  if (!actor.canRead || !actor.canWrite) return { status: "forbidden" };
  const memberIds = Array.from(new Set([actor.id, ...input.userIds].filter(Boolean))).sort();
  if (memberIds.length !== CHAT_DIRECT_MEMBER_COUNT) return { status: "invalid" };

  const teamId = storageTeamId(actor);
  const name = stableConversationName("dm", memberIds);
  const activeUsers = await listActiveTeamUsers(teamId);
  const activeUserIds = new Set(activeUsers.map((user) => user.id));
  if (memberIds.some((id) => !activeUserIds.has(id))) return { status: "notFound" };

  const existingChannelId = await findActiveDirectChannelIdByMemberIds(teamId, memberIds, name);
  if (existingChannelId) {
    const channel = await getVisibleChannel(actor, existingChannelId);
    return channel ? ok({ channel }) : { status: "forbidden" };
  }

  const now = nowIso();
  const id = makeId("chat-channel");
  try {
    await pool.query(
      `
        INSERT INTO chat_channels (id, team_id, type, name, display_name, purpose, header, created_by, created_at, updated_at)
        VALUES ($1, $2, 'direct', $3, '', '', '', $4, $5, $5)
      `,
      [id, teamId, name, actor.id, now],
    );
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "23505") {
      const conflict = await pool.query<{ id: string }>(
        "SELECT id FROM chat_channels WHERE team_id = $1 AND name = $2 AND archived_at IS NULL",
        [teamId, name],
      );
      const channel = conflict.rows[0]?.id ? await getVisibleChannel(actor, conflict.rows[0].id) : null;
      return channel ? ok({ channel }) : { status: "conflict" };
    }
    throw error;
  }
  const channelId = id;
  await addChannelMembersInternal({ channelId, memberUserIds: memberIds, ownerUserId: actor.id, teamId });

  const channel = await getVisibleChannel(actor, channelId);
  if (!channel) return { status: "notFound" };
  const recipients = await getChannelRecipientIds(teamId, channelId);
  publishChatChannelRealtime({
    eventType: "channel.created",
    teamId,
    channelId,
    actorUserId: actor.id,
    recipientUserIds: recipients,
  });
  return ok({ channel });
}

export async function updateChatChannel(
  channelId: string,
  input: { displayName?: string; favorite?: boolean; header?: string; muted?: boolean; name?: string; projectId?: string | null; purpose?: string },
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
    input.displayName !== undefined
    || input.header !== undefined
    || input.name !== undefined
    || input.projectId !== undefined
    || input.purpose !== undefined;
  if (metadataChanged) {
    if (channel.systemKind) return { status: "forbidden" };
    const isDirect = channel.type === "direct";
    if (isDirect && (
      input.displayName !== undefined
      || input.name !== undefined
      || input.projectId !== undefined
      || input.purpose !== undefined
    )) {
      return { status: "forbidden" };
    }
    if (!isDirect && !(await canManageChannel(actor, channelId))) return { status: "forbidden" };
    const displayName = input.displayName?.trim();
    const name = input.name === undefined ? undefined : normalizeChannelName(input.name);
    const projectIdChanged = input.projectId !== undefined;
    const projectId = projectIdChanged ? input.projectId?.trim() || null : null;
    if ((input.displayName !== undefined && !displayName) || (input.name !== undefined && !name)) return { status: "invalid" };
    if (projectId) {
      const project = await pool.query<{ id: string }>(
        "SELECT id FROM projects WHERE team_id = $1 AND id = $2 LIMIT 1",
        [storageTeamId(actor), projectId],
      );
      if (!project.rows[0]) return { status: "invalid" };
    }

    try {
      await pool.query(
        `
          UPDATE chat_channels
          SET display_name = COALESCE($2, display_name),
              name = COALESCE($3, name),
              purpose = COALESCE($4, purpose),
              header = COALESCE($5, header),
              project_id = CASE WHEN $6::boolean THEN $7 ELSE project_id END,
              updated_at = $8
          WHERE id = $1
        `,
        [
          channelId,
          displayName ?? null,
          name ?? null,
          input.purpose?.trim() ?? null,
          input.header?.trim() ?? null,
          projectIdChanged,
          projectId,
          nowIso(),
        ],
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
  const recipients = metadataChanged ? await getChannelRecipientIds(storageTeamId(actor), channelId) : [actor.id];
  publishChatChannelRealtime({
    eventType: "channel.updated",
    teamId: storageTeamId(actor),
    channelId,
    actorUserId: actor.id,
    recipientUserIds: recipients,
  });
  return ok({ channel: updated });
}

export async function archiveChatChannel(channelId: string, actor: ChatActor): Promise<Outcome<{ channelId: string }>> {
  if (!actor.canRead) return { status: "forbidden" };
  const channel = await getVisibleChannel(actor, channelId);
  if (!channel) return { status: "notFound" };
  if (channel.systemKind) return { status: "forbidden" };
  if (channel.type === "direct" || channel.name === DEFAULT_PUBLIC_CHANNEL_NAME) return { status: "forbidden" };
  if (!(await canManageChannel(actor, channelId))) return { status: "forbidden" };

  await pool.query("UPDATE chat_channels SET archived_at = $3, archived_by = $2, updated_at = $3 WHERE id = $1", [
    channelId,
    actor.id,
    nowIso(),
  ]);
  const recipients = await getChannelRecipientIds(storageTeamId(actor), channelId);
  publishChatChannelRealtime({
    teamId: storageTeamId(actor),
    recipientUserIds: recipients,
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
  if (channel.systemKind) return { status: "forbidden" };
  if (channel.type !== "private") return { status: "forbidden" };
  if (!(await canManageChannel(actor, channelId))) return { status: "forbidden" };

  await addChannelMembersInternal({ channelId, memberUserIds, teamId: storageTeamId(actor) });
  const updated = await getVisibleChannel(actor, channelId);
  if (!updated) return { status: "notFound" };
  const recipients = await getChannelRecipientIds(storageTeamId(actor), channelId);
  publishChatChannelRealtime({
    eventType: "member.changed",
    teamId: storageTeamId(actor),
    channelId,
    actorUserId: actor.id,
    recipientUserIds: recipients,
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
  if (channel.systemKind) return { status: "forbidden" };
  if (channel.type !== "private") return { status: "forbidden" };
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
  publishChatChannelRealtime({
    eventType: "member.changed",
    teamId: storageTeamId(actor),
    channelId,
    actorUserId: actor.id,
    recipientUserIds: recipients,
  });
  return ok({ channel: updated });
}

async function followMentionedThreadRecipients(
  client: Pick<PoolClient, "query">,
  input: { channelId: string; mentionedUserIds: string[]; rootMessageId: string | null; updatedAt: string },
) {
  if (!input.rootMessageId || input.mentionedUserIds.length === 0) return;
  await client.query(
    `
      INSERT INTO chat_thread_follows (root_message_id, user_id, following, last_viewed_at, updated_at)
      SELECT $1, mentioned.mentioned_user_id, true, null, $3::timestamptz
      FROM unnest($2::uuid[]) AS mentioned(mentioned_user_id)
      INNER JOIN chat_channel_members current_membership
        ON current_membership.channel_id = $4 AND current_membership.user_id = mentioned.mentioned_user_id
      ON CONFLICT (root_message_id, user_id)
      DO UPDATE SET following = true, updated_at = EXCLUDED.updated_at
    `,
    [input.rootMessageId, input.mentionedUserIds, input.updatedAt, input.channelId],
  );
}

async function createChatMessageAcknowledgementRequestRows(
  client: Pick<PoolClient, "query">,
  input: { channelId: string; messageId: string; requestedAt: string; requestedByUserId: string; teamId: string },
) {
  const created = await client.query<{ message_id: string }>(
    `
      INSERT INTO chat_message_ack_requests (
        message_id, team_id, channel_id, requested_by_user_id, requested_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $5)
      ON CONFLICT (message_id) DO NOTHING
      RETURNING message_id
    `,
    [input.messageId, input.teamId, input.channelId, input.requestedByUserId, input.requestedAt],
  );
  if (created.rows.length === 0) return;
  await client.query(
    `
      INSERT INTO chat_message_ack_recipients (message_id, user_id, assigned_at)
      SELECT $1, member.user_id, $4::timestamptz
      FROM chat_channel_members member
      INNER JOIN users recipient
        ON recipient.id = member.user_id
       AND COALESCE(recipient.status, 'active') = 'active'
      INNER JOIN chat_channels channel
        ON channel.id = member.channel_id
       AND channel.team_id = $3
      WHERE member.channel_id = $2
        AND member.user_id <> $5
      ON CONFLICT (message_id, user_id) DO NOTHING
    `,
    [input.messageId, input.channelId, input.teamId, input.requestedAt, input.requestedByUserId],
  );
}

export async function sendChatMessage(
  input: {
    attachmentIds?: string[];
    body: string;
    channelId: string;
    createdAt?: string;
    parentMessageId?: string | null;
    poll?: {
      options: string[];
      selectionMode: ChatPollSelectionMode;
      visibility: ChatPollVisibility;
    };
    requireAcknowledgement?: boolean;
    rootMessageId?: string | null;
    source?: ChatMessageSource;
    systemMetadata?: ChatMessageSystemMetadata;
  },
  actor: ChatActor,
): Promise<Outcome<{ channel: ChatChannel; message: ChatMessage }>> {
  if (!actor.canRead || !actor.canWrite) return { status: "forbidden" };
  const body = input.body.trim();
  const attachmentIds = Array.from(new Set((input.attachmentIds ?? []).filter(Boolean)));
  if (!body && attachmentIds.length === 0) return { status: "invalid" };
  const poll = input.poll ? normalizeChatPollDraft(input.poll) : null;
  if (input.poll && !poll) return { status: "invalid" };
  if (poll && (
    body.length > CHAT_POLL_INPUT_CONTRACT.maximumQuestionLength ||
    attachmentIds.length > 0 ||
    input.requireAcknowledgement ||
    input.rootMessageId ||
    input.parentMessageId ||
    (input.source && input.source !== "user")
  )) return { status: "invalid" };
  const channel = await getVisibleChannel(actor, input.channelId);
  if (!channel) return { status: "notFound" };
  if (channel.archivedAt) return { status: "forbidden" };
  const source = input.source ?? "user";
  if (channel.systemKind && source !== "system") return { status: "forbidden" };
  const systemMetadata = source === "system" ? input.systemMetadata ?? {} : {};
  const isSystemNotificationProjection = source === "system" && Boolean(systemMetadata.notificationEventId);
  const requireAcknowledgement = Boolean(input.requireAcknowledgement);

  const teamId = storageTeamId(actor);
  let rootMessageId = input.rootMessageId?.trim() || null;
  let parentMessageId = input.parentMessageId?.trim() || null;
  if (requireAcknowledgement && (rootMessageId || source !== "user")) return { status: "invalid" };
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

  const threadMentionRecipientIds = rootMessageId
    ? resolveThreadMentionRecipientIds({
        authorUserId: actor.id,
        body,
        channelMemberUserIds: channel.members.map((member) => member.userId),
      })
    : [];

  const messageId = makeId("chat-message");
  const now = input.createdAt ?? nowIso();
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
        INSERT INTO chat_messages (
          id, team_id, channel_id, author_user_id, source, system_metadata, body,
          root_message_id, parent_message_id, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $10)
      `,
      [messageId, teamId, input.channelId, actor.id, source, JSON.stringify(systemMetadata), body, rootMessageId, parentMessageId, now],
    );
    if (poll) {
      await insertChatPollRows(client, { createdAt: now, draft: poll, messageId });
    }
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
    await followMentionedThreadRecipients(client, {
      channelId: input.channelId,
      mentionedUserIds: threadMentionRecipientIds,
      rootMessageId,
      updatedAt: now,
    });
    if (requireAcknowledgement) {
      await createChatMessageAcknowledgementRequestRows(client, {
        channelId: input.channelId,
        messageId,
        requestedAt: now,
        requestedByUserId: actor.id,
        teamId,
      });
    }
    if (!isSystemNotificationProjection) {
      await enqueueChatPushDeliveries(client, {
        authorUserId: actor.id,
        channelId: input.channelId,
        createdAt: now,
        messageId,
        systemActorUserId: systemMetadata.actorUserId,
        teamId,
      });
    }
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
  // Realtime is an opportunistic wakeup. A failed online broadcast must never
  // turn an already committed chat message into an API failure.
  void publishChatMessageCreatedRealtime({ channel: updatedChannel, message, teamId }).catch(() => undefined);
  wakeChatPushDeliveryWorker();
  return ok({ channel: updatedChannel, message });
}

async function chatPollMutationResponse(
  input: { channelId: string; messageId: string },
  actor: ChatActor,
  mutation: Awaited<ReturnType<typeof replaceChatPollVote>>,
): Promise<Outcome<{ channel: ChatChannel; message: ChatMessage }>> {
  if (mutation.status !== "ok") return mutation;
  const [message, channel, recipientUserIds] = await Promise.all([
    getMessageById(actor, input.messageId),
    getVisibleChannel(actor, input.channelId),
    getChannelRecipientIds(storageTeamId(actor), input.channelId),
  ]);
  if (!message || !channel) return { status: "notFound" };
  publishChatMessageMutationRealtime({
    actorUserId: mutation.visibility === "anonymous" ? null : actor.id,
    channelId: input.channelId,
    eventType: "message.updated",
    messageId: input.messageId,
    recipientUserIds,
    rootMessageId: mutation.rootMessageId,
    teamId: storageTeamId(actor),
  });
  return ok({ channel, message });
}

export async function setChatPollVote(
  input: { channelId: string; messageId: string; optionIds: string[] },
  actor: ChatActor,
): Promise<Outcome<{ channel: ChatChannel; message: ChatMessage }>> {
  if (!actor.canRead || !actor.canWrite) return { status: "forbidden" };
  const mutation = await replaceChatPollVote({
    actorUserId: actor.id,
    channelId: input.channelId,
    messageId: input.messageId,
    optionIds: input.optionIds,
    teamId: storageTeamId(actor),
  });
  return chatPollMutationResponse(input, actor, mutation);
}

export async function endChatPoll(
  input: { channelId: string; messageId: string },
  actor: ChatActor,
): Promise<Outcome<{ channel: ChatChannel; message: ChatMessage }>> {
  if (!actor.canRead || !actor.canWrite) return { status: "forbidden" };
  const mutation = await closeChatPoll({
    actorUserId: actor.id,
    channelId: input.channelId,
    messageId: input.messageId,
    teamId: storageTeamId(actor),
  });
  return chatPollMutationResponse(input, actor, mutation);
}

export async function requestChatMessageAcknowledgement(
  input: { channelId: string; messageId: string },
  actor: ChatActor,
): Promise<Outcome<{ channel: ChatChannel; message: ChatMessage }>> {
  if (!actor.canRead || !actor.canWrite) return { status: "forbidden" };
  const channel = await getVisibleChannel(actor, input.channelId);
  if (!channel) return { status: "notFound" };
  if (channel.archivedAt || channel.systemKind) return { status: "forbidden" };
  const message = await getRawMessage(actor, input.messageId);
  if (!message || message.channel_id !== input.channelId || message.deleted_at) return { status: "notFound" };
  if (message.source === "system" || message.root_message_id !== null) return { status: "invalid" };
  if (message.author_user_id !== actor.id) return { status: "forbidden" };

  const teamId = storageTeamId(actor);
  const now = nowIso();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await createChatMessageAcknowledgementRequestRows(client, {
      channelId: input.channelId,
      messageId: input.messageId,
      requestedAt: now,
      requestedByUserId: actor.id,
      teamId,
    });
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }

  const updated = await getMessageById(actor, input.messageId);
  const updatedChannel = await getVisibleChannel(actor, input.channelId);
  if (!updated || !updatedChannel) return { status: "notFound" };
  const recipients = await getChannelRecipientIds(teamId, input.channelId);
  publishChatMessageMutationRealtime({
    eventType: "message.updated",
    teamId,
    channelId: input.channelId,
    actorUserId: actor.id,
    messageId: input.messageId,
    rootMessageId: null,
    recipientUserIds: recipients,
  });
  return ok({ channel: updatedChannel, message: updated });
}

export async function updateChatMessage(
  input: { body: string; channelId: string; messageId: string },
  actor: ChatActor,
): Promise<Outcome<{ channel: ChatChannel; message: ChatMessage }>> {
  if (!actor.canRead || !actor.canWrite) return { status: "forbidden" };
  const body = input.body.trim();
  if (!body) return { status: "invalid" };
  const channel = await getVisibleChannel(actor, input.channelId);
  if (!channel) return { status: "notFound" };
  const message = await getRawMessage(actor, input.messageId);
  if (!message || message.channel_id !== input.channelId || message.deleted_at) return { status: "notFound" };
  if (message.source === "system") return { status: "forbidden" };
  if (message.author_user_id !== actor.id) return { status: "forbidden" };

  const now = nowIso();
  const threadMentionRecipientIds = message.root_message_id
    ? resolveThreadMentionRecipientIds({
        authorUserId: actor.id,
        body,
        channelMemberUserIds: channel.members.map((member) => member.userId),
      })
    : [];
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("UPDATE chat_messages SET body = $3, updated_at = $4, edited_at = $4 WHERE id = $1 AND channel_id = $2", [
      input.messageId,
      input.channelId,
      body,
      now,
    ]);
    await followMentionedThreadRecipients(client, {
      channelId: input.channelId,
      mentionedUserIds: threadMentionRecipientIds,
      rootMessageId: message.root_message_id,
      updatedAt: now,
    });
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
  const updated = await getMessageById(actor, input.messageId);
  const updatedChannel = await getVisibleChannel(actor, input.channelId);
  if (!updated || !updatedChannel) return { status: "notFound" };
  const recipients = await getChannelRecipientIds(storageTeamId(actor), input.channelId);
  publishChatMessageMutationRealtime({
    eventType: "message.updated",
    teamId: storageTeamId(actor),
    channelId: input.channelId,
    actorUserId: actor.id,
    messageId: input.messageId,
    rootMessageId: updated.rootMessageId ?? null,
    recipientUserIds: recipients,
  });
  return ok({ channel: updatedChannel, message: updated });
}

export async function deleteChatMessage(
  input: { channelId: string; messageId: string },
  actor: ChatActor,
): Promise<Outcome<{ channel: ChatChannel; message: ChatMessage }>> {
  if (!actor.canRead) return { status: "forbidden" };
  const channel = await getVisibleChannel(actor, input.channelId);
  if (!channel) return { status: "notFound" };
  const message = await getRawMessage(actor, input.messageId);
  if (!message || message.channel_id !== input.channelId || message.deleted_at) return { status: "notFound" };
  if (message.source === "system") return { status: "forbidden" };
  const mayManage = await canManageChannel(actor, input.channelId);
  if (message.author_user_id !== actor.id && !mayManage) return { status: "forbidden" };

  await pool.query("UPDATE chat_messages SET deleted_at = $3, deleted_by = $4, updated_at = $3 WHERE id = $1 AND channel_id = $2", [
    input.messageId,
    input.channelId,
    nowIso(),
    actor.id,
  ]);
  const updated = await getMessageById(actor, input.messageId);
  const updatedChannel = await getVisibleChannel(actor, input.channelId);
  if (!updated || !updatedChannel) return { status: "notFound" };
  const recipients = await getChannelRecipientIds(storageTeamId(actor), input.channelId);
  publishChatMessageMutationRealtime({
    eventType: "message.deleted",
    teamId: storageTeamId(actor),
    channelId: input.channelId,
    actorUserId: actor.id,
    messageId: input.messageId,
    rootMessageId: updated.rootMessageId ?? null,
    recipientUserIds: recipients,
  });
  return ok({ channel: updatedChannel, message: updated });
}

export async function setChatReaction(
  input: { channelId: string; emojiName: string; messageId: string; reacting: boolean },
  actor: ChatActor,
): Promise<Outcome<{ message: ChatMessage; reactionChanged: boolean }>> {
  if (!actor.canRead || !actor.canWrite) return { status: "forbidden" };
  const emojiName = input.emojiName.trim().slice(0, 80);
  if (!emojiName) return { status: "invalid" };
  if (!(await hasReadableChannel(actor, input.channelId))) return { status: "notFound" };
  const message = await getRawMessage(actor, input.messageId);
  if (!message || message.channel_id !== input.channelId || message.deleted_at) return { status: "notFound" };

  const mutation = input.reacting
    ? await pool.query(
      `
        INSERT INTO chat_message_reactions (message_id, user_id, emoji_name, created_at)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (message_id, user_id, emoji_name) DO NOTHING
      `,
      [input.messageId, actor.id, emojiName, nowIso()],
    )
    : await pool.query("DELETE FROM chat_message_reactions WHERE message_id = $1 AND user_id = $2 AND emoji_name = $3", [
      input.messageId,
      actor.id,
      emojiName,
    ]);
  const reactionChanged = mutation.rowCount === 1;

  const updated = await getMessageById(actor, input.messageId);
  if (!updated) return { status: "notFound" };
  if (reactionChanged) {
    const recipients = await getChannelRecipientIds(storageTeamId(actor), input.channelId);
    publishChatMessageMutationRealtime({
      eventType: "reaction.changed",
      teamId: storageTeamId(actor),
      channelId: input.channelId,
      actorUserId: actor.id,
      messageId: input.messageId,
      rootMessageId: updated.rootMessageId ?? null,
      recipientUserIds: recipients,
    });
  }
  return ok({ message: updated, reactionChanged });
}

export async function setChatMessagePin(
  input: { channelId: string; messageId: string; pinned: boolean },
  actor: ChatActor,
): Promise<Outcome<{ message: ChatMessage }>> {
  if (!actor.canRead || !actor.canWrite) return { status: "forbidden" };
  if (!(await hasReadableChannel(actor, input.channelId))) return { status: "notFound" };
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
  publishChatMessageMutationRealtime({
    eventType: "message.updated",
    teamId: storageTeamId(actor),
    channelId: input.channelId,
    actorUserId: actor.id,
    messageId: input.messageId,
    rootMessageId: updated.rootMessageId ?? null,
    recipientUserIds: recipients,
  });
  return ok({ message: updated });
}

export async function setChatMessageSaved(
  input: { channelId: string; messageId: string; saved: boolean },
  actor: ChatActor,
): Promise<Outcome<{ message: ChatMessage }>> {
  if (!actor.canRead) return { status: "forbidden" };
  if (!(await hasReadableChannel(actor, input.channelId))) return { status: "notFound" };
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
  publishChatMessageMutationRealtime({
    teamId: storageTeamId(actor),
    recipientUserIds: [actor.id],
    actorUserId: actor.id,
    channelId: input.channelId,
    eventType: "message.updated",
    messageId: updated.id,
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
             m.source, m.system_metadata, m.created_at, m.updated_at, m.edited_at, m.deleted_at, m.deleted_by
      FROM chat_message_pins p
      INNER JOIN chat_messages m ON m.id = p.message_id
      INNER JOIN users u ON u.id = m.author_user_id
      WHERE p.channel_id = $1
        AND m.team_id = $2
        AND m.deleted_at IS NULL
        AND ${visibleChatMessageSql("m", "$3", "$4", "$5")}
      ORDER BY p.pinned_at DESC
      LIMIT 100
    `,
    [
      channelId,
      storageTeamId(actor),
      actor.id,
      E2E_NOTIFICATION_ACTOR_NAME_SQL_PATTERN,
      normalizedE2eNotificationViewerEmails(),
    ],
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
             m.source, m.system_metadata, m.created_at, m.updated_at, m.edited_at, m.deleted_at, m.deleted_by,
             c.id AS channel_id_for_channel
      FROM chat_message_saves s
      INNER JOIN chat_messages m ON m.id = s.message_id
      INNER JOIN chat_channels c ON c.id = m.channel_id
      INNER JOIN chat_channel_members cm ON cm.channel_id = c.id AND cm.user_id = $2
      INNER JOIN users u ON u.id = m.author_user_id
      WHERE m.team_id = $1
        AND m.deleted_at IS NULL
        AND c.archived_at IS NULL
        AND ${visibleChatMessageSql("m", "$2", "$3", "$4")}
      ORDER BY s.saved_at DESC
      LIMIT 100
    `,
    [teamId, actor.id, E2E_NOTIFICATION_ACTOR_NAME_SQL_PATTERN, normalizedE2eNotificationViewerEmails()],
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

export type ChatChannelReadStateAdvance = {
  channelId: string;
  readAt: string;
  readThroughAt: Date | string;
  teamId: string;
  userId: string;
};

export async function advanceChatChannelReadState(
  client: PoolClient,
  channelId: string,
  actor: ChatActor,
  options: { includeThreads?: boolean; messageId?: string | null } = {},
): Promise<Outcome<ChatChannelReadStateAdvance>> {
  if (!actor.canRead) return { status: "forbidden" };
  if (!(await hasReadableChannel(actor, channelId))) return { status: "notFound" };
  const readAt = nowIso();
  const teamId = storageTeamId(actor);
  const targetMessageResult = options.messageId
    ? await client.query<{ created_at: Date | string; id: string }>(
      `
        SELECT id, created_at
        FROM chat_messages
        WHERE team_id = $1
          AND channel_id = $2
          AND id = $3
          AND root_message_id IS NULL
          AND deleted_at IS NULL
        LIMIT 1
      `,
      [teamId, channelId, options.messageId],
    )
    : await client.query<{ created_at: Date | string; id: string }>(
      `
        SELECT id, created_at
        FROM chat_messages
        WHERE team_id = $1
          AND channel_id = $2
          AND root_message_id IS NULL
          AND deleted_at IS NULL
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [teamId, channelId],
    );
  const targetMessage = targetMessageResult.rows[0] ?? null;
  if (options.messageId && !targetMessage) {
    return { status: "notFound" };
  }
  const lastReadAt = options.messageId && targetMessage ? targetMessage.created_at : readAt;
  const lastReadMessageId = targetMessage?.id ?? null;
  await client.query(
    `
      UPDATE chat_channel_members
      SET
        last_viewed_at = $3,
        last_read_at = CASE
          WHEN last_read_at IS NULL OR last_read_at < $4::timestamptz THEN $4
          ELSE last_read_at
        END,
        last_read_message_id = CASE
          WHEN last_read_at IS NULL OR last_read_at < $4::timestamptz THEN $5
          ELSE last_read_message_id
        END,
        manually_unread = CASE
          WHEN last_read_at IS NULL OR last_read_at <= $4::timestamptz THEN false
          ELSE manually_unread
        END
      WHERE channel_id = $1 AND user_id = $2
    `,
    [channelId, actor.id, readAt, lastReadAt, lastReadMessageId],
  );
  if (options.includeThreads && !options.messageId) {
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
      [channelId, actor.id, readAt, teamId],
    );
    await client.query(
      `
        INSERT INTO chat_thread_follows (root_message_id, user_id, following, last_viewed_at, updated_at)
        SELECT DISTINCT m.root_message_id, $2::uuid, true, $3::timestamptz, $3::timestamptz
        FROM chat_messages m
        INNER JOIN chat_messages root ON root.id = m.root_message_id
          AND root.team_id = m.team_id
          AND root.channel_id = m.channel_id
          AND root.root_message_id IS NULL
          AND root.deleted_at IS NULL
        WHERE m.team_id = $4
          AND m.channel_id = $1
          AND m.root_message_id IS NOT NULL
          AND m.author_user_id <> $2
          AND m.deleted_at IS NULL
          AND (m.body LIKE $5 OR m.body ~* $6)
          AND ${visibleChatMessageSql("m", "$2", "$7", "$8")}
          AND ${visibleChatMessageSql("root", "$2", "$7", "$8")}
        ON CONFLICT (root_message_id, user_id)
        DO UPDATE SET last_viewed_at = EXCLUDED.last_viewed_at, updated_at = EXCLUDED.updated_at
      `,
      [
        channelId,
        actor.id,
        readAt,
        teamId,
        `%orf-user:${actor.id}%`,
        CHAT_BROADCAST_MENTION_SQL_PATTERN,
        E2E_NOTIFICATION_ACTOR_NAME_SQL_PATTERN,
        normalizedE2eNotificationViewerEmails(),
      ],
    );
  }
  return ok({
    channelId,
    readAt,
    readThroughAt: lastReadAt,
    teamId,
    userId: actor.id,
  });
}

export type ChatChannelUnreadStateChange = {
  channelId: string;
  targetMessageId: string | null;
  teamId: string;
  userId: string;
};

export async function setChatChannelUnreadState(
  client: PoolClient,
  input: { channelId: string; messageId?: string | null },
  actor: ChatActor,
): Promise<Outcome<ChatChannelUnreadStateChange>> {
  if (!actor.canRead) return { status: "forbidden" };
  if (!(await hasReadableChannel(actor, input.channelId))) return { status: "notFound" };
  const readStateUpdatedAt = nowIso();
  const teamId = storageTeamId(actor);

  if (input.messageId) {
    const message = await getRawMessage(actor, input.messageId);
    if (!message || message.channel_id !== input.channelId || message.deleted_at) return { status: "notFound" };
    const rootMessage = message.root_message_id ? await getRawMessage(actor, message.root_message_id) : message;
    if (!rootMessage || rootMessage.channel_id !== input.channelId || rootMessage.root_message_id !== null) return { status: "notFound" };
    const { rows } = await client.query<{ created_at: Date | string; id: string }>(
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
      [teamId, input.channelId, rootMessage.created_at],
    );
    await client.query(
      `
        UPDATE chat_channel_members
        SET last_read_at = $3, last_read_message_id = $4, manually_unread = true, last_viewed_at = $5
        WHERE channel_id = $1 AND user_id = $2
      `,
      [input.channelId, actor.id, rows[0]?.created_at ?? null, rows[0]?.id ?? null, readStateUpdatedAt],
    );
    return ok({
      channelId: input.channelId,
      targetMessageId: rootMessage.id,
      teamId,
      userId: actor.id,
    });
  }

  const { rows: latestRows } = await client.query<{ created_at: Date | string; id: string }>(
    `
      SELECT id, created_at
      FROM chat_messages
      WHERE team_id = $1
        AND channel_id = $2
        AND root_message_id IS NULL
        AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [teamId, input.channelId],
  );
  const latestRootMessage = latestRows[0];
  if (!latestRootMessage) {
    return ok({
      channelId: input.channelId,
      targetMessageId: null,
      teamId,
      userId: actor.id,
    });
  }
  const { rows } = await client.query<{ created_at: Date | string; id: string }>(
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
    [teamId, input.channelId, latestRootMessage.created_at],
  );
  await client.query(
    `
      UPDATE chat_channel_members
      SET last_read_at = $3, last_read_message_id = $4, manually_unread = true, last_viewed_at = $5
      WHERE channel_id = $1 AND user_id = $2
    `,
    [input.channelId, actor.id, rows[0]?.created_at ?? null, rows[0]?.id ?? null, readStateUpdatedAt],
  );
  return ok({
    channelId: input.channelId,
    targetMessageId: latestRootMessage.id,
    teamId,
    userId: actor.id,
  });
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
  input: { body: Readable; channelId: string; fileName: string; mimeType: string },
  actor: ChatActor,
): Promise<Outcome<{ attachment: ChatAttachment }>> {
  if (!actor.canRead || !actor.canWrite) return { status: "forbidden" };
  if (!input.fileName.trim()) return { status: "invalid" };
  const settings = await readChatSettings();
  const channel = await getVisibleChannel(actor, input.channelId);
  if (!channel) return { status: "notFound" };

  const id = makeChatAttachmentId();
  const now = nowIso();
  const expiresAt = new Date(Date.now() + CHAT_ATTACHMENT_TTL_MS).toISOString();
  const originalFileName = input.fileName.trim();
  const fileName = originalFileName.slice(0, 240);
  const declaredMimeType = normalizeMimeType(input.mimeType);
  const mimeType = attachmentNativeVideoContentType({ fileName: originalFileName, mimeType: declaredMimeType }) ?? declaredMimeType;
  const objectKey = `chat/${safePathSegment(storageTeamId(actor))}/${safePathSegment(input.channelId)}/${id}/${safePathSegment(fileName)}`;

  let stored: { contentLength: number; peeked: Buffer };
  try {
    stored = await objectStorage.putObjectStream({
      body: input.body,
      contentType: mimeType,
      key: objectKey,
      maxBytes: settings.attachmentMaxBytes,
      peekBytes: 4096,
    });
  } catch (error) {
    if (error instanceof ObjectStorageUploadTooLargeError) return { status: "tooLarge" };
    if (error instanceof ObjectStorageUploadEmptyError) return { status: "invalid" };
    throw error;
  }

  if (stored.contentLength <= 0) return { status: "invalid" };
  const imageMetadata = mimeType.startsWith("image/") ? readImageMetadata(stored.peeked) : null;
  const imageWidth = imageMetadata?.width ?? null;
  const imageHeight = imageMetadata?.height ?? null;

  try {
    await pool.query(
      `
        INSERT INTO chat_attachments (id, team_id, channel_id, message_id, object_key, file_name, mime_type, file_size, width, height, created_by, created_at, expires_at)
        VALUES ($1, $2, $3, null, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      `,
      [
        id,
        storageTeamId(actor),
        input.channelId,
        objectKey,
        fileName,
        mimeType,
        stored.contentLength,
        imageWidth,
        imageHeight,
        actor.id,
        now,
        expiresAt,
      ],
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
      fileSize: stored.contentLength,
      contentUrl: chatAttachmentContentUrl(id),
      previewKind: attachmentPreviewKind({ fileName, mimeType }),
      width: imageWidth,
      height: imageHeight,
      createdAt: now,
    },
  });
}

export async function getChatAttachmentContent(
  attachmentId: string,
  actor: ChatActor,
  options: { readonly byteRange?: ByteRangeSelection } = {},
): Promise<
  | {
      status: "ok";
      body: Readable;
      contentLength?: number;
      contentType: string;
      range?: ResolvedByteRange;
      totalContentLength: number;
    }
  | { status: "rangeNotSatisfiable"; totalContentLength: number }
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
  if (!(await hasReadableChannel(actor, row.channel_id)) && row.created_by !== actor.id) return { status: "forbidden" };

  const totalContentLength = row.file_size;
  const byteRange = resolveByteRangeSelection(options.byteRange ?? { status: "none" }, totalContentLength);
  if (byteRange.status === "unsatisfiable") return { status: "rangeNotSatisfiable", totalContentLength };

  const range = byteRange.status === "satisfiable" ? byteRange.range : undefined;
  const stored = await objectStorage.getObject(row.object_key, { byteRange: range });
  if (!stored) return { status: "notFound" };
  return {
    status: "ok",
    body: stored.body,
    contentLength: range ? byteRangeContentLength(range) : stored.contentLength ?? totalContentLength,
    contentType: chatAttachmentContentType(row, stored.contentType),
    range,
    totalContentLength,
  };
}

function chatAttachmentContentType(row: Pick<AttachmentRow, "file_name" | "mime_type">, storedContentType?: string | null) {
  const contentType = storedContentType ?? row.mime_type;
  const normalizedContentType = normalizeMimeType(contentType);
  const videoContentType = attachmentNativeVideoContentType({ fileName: row.file_name, mimeType: row.mime_type });
  return videoContentType && normalizedContentType === "application/octet-stream" ? videoContentType : contentType;
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
  const visibilityClause = visibleChatMessageSql(
    "m",
    "$2",
    pushParam(E2E_NOTIFICATION_ACTOR_NAME_SQL_PATTERN),
    pushParam(normalizedE2eNotificationViewerEmails()),
  );
  type SearchRow = MessageRow & {
    channel_archived_at: Date | string | null;
    channel_created_at: Date | string;
    channel_created_by: string | null;
    channel_display_name: string;
    channel_header: string;
    channel_integration_provider: ChatChannel["integrationProvider"];
    channel_name: string | null;
    channel_project_id: string | null;
    channel_project_name: string | null;
    channel_purpose: string;
    channel_system_kind: ChatChannel["systemKind"];
    channel_system_recipient_user_id: string | null;
    channel_type: ChatChannelType;
    channel_updated_at: Date | string;
  };
  const { rows } = await pool.query<SearchRow>(
    `
      SELECT m.id, m.channel_id, m.author_user_id, u.name AS author_name, u.avatar_object_key AS author_avatar_object_key,
             u.avatar_updated_at AS author_avatar_updated_at, m.body, m.root_message_id, m.parent_message_id,
             m.source, m.system_metadata, m.created_at, m.updated_at, m.edited_at, m.deleted_at, m.deleted_by,
             c.type AS channel_type, c.name AS channel_name, c.integration_provider AS channel_integration_provider, c.system_kind AS channel_system_kind,
             c.system_recipient_user_id AS channel_system_recipient_user_id, c.display_name AS channel_display_name, c.purpose AS channel_purpose,
             c.project_id AS channel_project_id, p.name AS channel_project_name, c.header AS channel_header, c.created_by AS channel_created_by, c.created_at AS channel_created_at,
             c.updated_at AS channel_updated_at, c.archived_at AS channel_archived_at
      FROM chat_messages m
      INNER JOIN chat_channels c ON c.id = m.channel_id
      LEFT JOIN projects p ON p.id = c.project_id AND p.team_id = c.team_id
      INNER JOIN chat_channel_members cm ON cm.channel_id = c.id AND cm.user_id = $2
      INNER JOIN users u ON u.id = m.author_user_id
      WHERE m.team_id = $1
        AND m.deleted_at IS NULL
        AND c.archived_at IS NULL
        AND ${visibilityClause}
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
    source: row.source,
    system_metadata: row.system_metadata,
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
    integration_provider: row.channel_integration_provider ?? null,
    project_id: row.channel_project_id,
    project_name: row.channel_project_name,
    system_kind: row.channel_system_kind ?? null,
    system_recipient_user_id: row.channel_system_recipient_user_id,
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
  const usersById = await loadUsersByIds(storageTeamId(actor), memberIds);
  return ok({ users: memberIds.map((id) => usersById.get(id)).filter((user): user is ChatUser => Boolean(user)) });
}
