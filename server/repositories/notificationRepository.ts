import type {
  AppNotification,
  ChatMessageSystemMetadata,
  CommentTargetType,
  NotificationKind,
  NotificationStream,
  NotificationTargetType,
} from "../../src/types/orf";
import { pool } from "../db/client";
import { ensureOrfChatBotActor } from "../integrations/orf-chat-delivery";
import { sendChatMessage, type ChatActor } from "./chatRepository";
import { makeId, nowIso, stableConversationName } from "./chatRepositoryModel";
import type { RuntimeScope } from "./runtimeScope";
import { runtimeScope, runtimeScopeStorageId } from "./runtimeScope";

export type NotificationEventInput = {
  actorName: string;
  actorUserId?: string | null;
  body: string;
  kind: NotificationKind;
  metadata?: Record<string, string>;
  recipientUserIds: string[];
  replyTargetId?: string | null;
  replyTargetType?: CommentTargetType | null;
  stream: NotificationStream;
  targetHref: string;
  targetId: string;
  targetType: NotificationTargetType;
  teamId: string;
  title: string;
};

type SystemChatMessageProjectionRow = {
  actor_name: string | null;
  actor_user_id: string | null;
  body: string;
  channel_id: string;
  channel_system_kind: NotificationStream;
  created_at: Date | string;
  id: string;
  last_read_at: Date | string | null;
  notification_event_id: string | null;
  recipient_user_id: string | null;
  reply_target_id: string | null;
  reply_target_type: CommentTargetType | null;
  system_metadata: ChatMessageSystemMetadata | null;
  target_href: string | null;
  target_id: string | null;
  target_title: string | null;
  target_type: NotificationTargetType | null;
  title: string | null;
};

const SYSTEM_BOT_EMAIL = "orf-system@orf.local";
const SYSTEM_BOT_NAME = "ORF 系统通知";
const SYSTEM_ANNOUNCEMENT_CHANNEL_NAME = "orf-system-announcements";
const SYSTEM_ANNOUNCEMENT_TITLE = "系统公告";
const PERSONAL_NOTIFICATION_TITLE = "我的系统通知";

function iso(value: Date | string | null | undefined) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function uniqueRecipients(recipientUserIds: string[], actorUserId?: string | null) {
  const actor = actorUserId?.trim();
  return Array.from(new Set(recipientUserIds.map((id) => id.trim()).filter(Boolean))).filter((id) => id !== actor);
}

function notificationBody(input: Pick<NotificationEventInput, "body" | "targetHref" | "title">) {
  const title = input.title.trim();
  const body = input.body.trim();
  const targetHref = input.targetHref.trim();
  const content = body ? `**${title}**\n\n${body}` : `**${title}**`;
  return targetHref ? `${content}\n\n[打开目标](${targetHref})` : content;
}

function systemMetadata(input: NotificationEventInput, recipientUserId?: string | null): ChatMessageSystemMetadata {
  return {
    actorName: input.actorName.trim(),
    actorUserId: input.actorUserId?.trim() || null,
    kind: input.kind,
    metadata: input.metadata ?? {},
    notificationEventId: makeId("system-notification"),
    recipientUserId: recipientUserId ?? null,
    replyTargetId: input.replyTargetId ?? null,
    replyTargetType: input.replyTargetType ?? null,
    stream: input.stream,
    targetHref: input.targetHref,
    targetId: input.targetId,
    targetTitle: input.metadata?.targetTitle ?? input.title,
    targetType: input.targetType,
    title: input.title.trim(),
  };
}

function toNotification(row: SystemChatMessageProjectionRow, userId: string): AppNotification {
  const metadata = row.system_metadata ?? {};
  const createdAt = iso(row.created_at) ?? nowIso();
  const lastReadAt = iso(row.last_read_at);
  const readAt = lastReadAt && Date.parse(lastReadAt) >= Date.parse(createdAt) ? lastReadAt : null;
  return {
    id: row.id,
    kind: metadata.kind ?? "feedback.created",
    recipientUserId: metadata.recipientUserId ?? row.recipient_user_id ?? userId,
    actorUserId: metadata.actorUserId ?? row.actor_user_id ?? null,
    actorName: metadata.actorName ?? row.actor_name ?? SYSTEM_BOT_NAME,
    title: metadata.title ?? row.title ?? row.target_title ?? "系统消息",
    body: row.body,
    stream: metadata.stream ?? row.channel_system_kind,
    targetType: metadata.targetType ?? row.target_type ?? "feedback",
    targetId: metadata.targetId ?? row.target_id ?? "",
    targetHref: metadata.targetHref ?? row.target_href ?? "/chat",
    replyTargetType: metadata.replyTargetType ?? row.reply_target_type ?? null,
    replyTargetId: metadata.replyTargetId ?? row.reply_target_id ?? null,
    readAt,
    createdAt,
    metadata: metadata.metadata ?? {},
  };
}

async function ensureSystemBotActor(teamId: string) {
  return ensureOrfChatBotActor({
    botEmail: SYSTEM_BOT_EMAIL,
    botName: SYSTEM_BOT_NAME,
    teamId,
  });
}

async function ensureTeamAnnouncementChannel(input: { actor: ChatActor; teamId: string }) {
  const existing = await pool.query<{ id: string }>(
    `
      SELECT id
      FROM chat_channels
      WHERE team_id = $1
        AND system_kind = 'teamAnnouncement'
        AND archived_at IS NULL
      ORDER BY created_at ASC
      LIMIT 1
    `,
    [input.teamId],
  );
  const existingId = existing.rows[0]?.id;
  if (existingId) {
    await ensureActivePublicChannelMemberships(input.teamId);
    return existingId;
  }

  const now = nowIso();
  const channelId = makeId("chat-channel");
  await pool.query(
    `
      INSERT INTO chat_channels (
        id, team_id, type, name, system_kind, system_recipient_user_id,
        display_name, purpose, header, created_by, created_at, updated_at
      )
      VALUES ($1, $2, 'public', $3, 'teamAnnouncement', null, $4, $5, $6, $7, $8, $8)
      ON CONFLICT (team_id, name) DO UPDATE
      SET system_kind = 'teamAnnouncement',
          display_name = EXCLUDED.display_name,
          purpose = EXCLUDED.purpose,
          header = EXCLUDED.header,
          updated_at = EXCLUDED.updated_at
      RETURNING id
    `,
    [
      channelId,
      input.teamId,
      SYSTEM_ANNOUNCEMENT_CHANNEL_NAME,
      SYSTEM_ANNOUNCEMENT_TITLE,
      "全体可见的系统公告和公共业务事件",
      "系统事件以普通聊天消息进入这个频道。",
      input.actor.id,
      now,
    ],
  );
  const selected = await pool.query<{ id: string }>(
    `
      SELECT id
      FROM chat_channels
      WHERE team_id = $1
        AND system_kind = 'teamAnnouncement'
        AND archived_at IS NULL
      ORDER BY created_at ASC
      LIMIT 1
    `,
    [input.teamId],
  );
  const id = selected.rows[0]?.id ?? channelId;
  await ensureActivePublicChannelMemberships(input.teamId);
  return id;
}

async function ensurePersonalNotificationChannel(input: { actor: ChatActor; recipientUserId: string; teamId: string }) {
  const existing = await pool.query<{ id: string }>(
    `
      SELECT id
      FROM chat_channels
      WHERE team_id = $1
        AND system_kind = 'personalNotification'
        AND system_recipient_user_id = $2
        AND archived_at IS NULL
      ORDER BY created_at ASC
      LIMIT 1
    `,
    [input.teamId, input.recipientUserId],
  );
  const existingId = existing.rows[0]?.id;
  if (existingId) {
    await ensureDirectChannelMembers({
      botUserId: input.actor.id,
      channelId: existingId,
      recipientUserId: input.recipientUserId,
      teamId: input.teamId,
    });
    return existingId;
  }

  const recipient = await pool.query<{ id: string }>(
    `
      SELECT u.id
      FROM users u
      INNER JOIN team_members tm ON tm.user_id = u.id AND tm.team_id = $1
      WHERE u.id = $2
        AND COALESCE(u.status, 'active') = 'active'
      LIMIT 1
    `,
    [input.teamId, input.recipientUserId],
  );
  if (!recipient.rows[0]) return null;

  const now = nowIso();
  const channelId = makeId("chat-channel");
  const name = stableConversationName("dm", [input.actor.id, input.recipientUserId]);
  await pool.query(
    `
      INSERT INTO chat_channels (
        id, team_id, type, name, system_kind, system_recipient_user_id,
        display_name, purpose, header, created_by, created_at, updated_at
      )
      VALUES ($1, $2, 'direct', $3, 'personalNotification', $4, $5, $6, $7, $8, $9, $9)
      ON CONFLICT (team_id, name) DO UPDATE
      SET system_kind = 'personalNotification',
          system_recipient_user_id = EXCLUDED.system_recipient_user_id,
          display_name = EXCLUDED.display_name,
          purpose = EXCLUDED.purpose,
          header = EXCLUDED.header,
          updated_at = EXCLUDED.updated_at
    `,
    [
      channelId,
      input.teamId,
      name,
      input.recipientUserId,
      PERSONAL_NOTIFICATION_TITLE,
      "只投递给你的系统通知和业务提醒",
      "系统事件以普通聊天消息进入这个私聊。",
      input.actor.id,
      now,
    ],
  );
  const selected = await pool.query<{ id: string }>(
    `
      SELECT id
      FROM chat_channels
      WHERE team_id = $1
        AND system_kind = 'personalNotification'
        AND system_recipient_user_id = $2
        AND archived_at IS NULL
      ORDER BY created_at ASC
      LIMIT 1
    `,
    [input.teamId, input.recipientUserId],
  );
  const id = selected.rows[0]?.id ?? channelId;
  await ensureDirectChannelMembers({
    botUserId: input.actor.id,
    channelId: id,
    recipientUserId: input.recipientUserId,
    teamId: input.teamId,
  });
  return id;
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

async function ensureDirectChannelMembers(input: { botUserId: string; channelId: string; recipientUserId: string; teamId: string }) {
  const now = nowIso();
  await pool.query(
    `
      INSERT INTO chat_channel_members (channel_id, user_id, role, favorite, muted, manually_unread, joined_at)
      SELECT $1, u.id, CASE WHEN u.id = $3 THEN 'owner'::chat_member_role ELSE 'member'::chat_member_role END,
             false, false, false, $5
      FROM users u
      INNER JOIN team_members tm ON tm.user_id = u.id AND tm.team_id = $2
      WHERE u.id = ANY($4::uuid[])
        AND COALESCE(u.status, 'active') = 'active'
      ON CONFLICT (channel_id, user_id) DO NOTHING
    `,
    [input.channelId, input.teamId, input.botUserId, [input.botUserId, input.recipientUserId], now],
  );
}

async function markActorRead(input: { actorUserId?: string | null; channelId: string; messageId: string; readAt: string }) {
  const actorUserId = input.actorUserId?.trim();
  if (!actorUserId) return;
  await pool.query(
    `
      UPDATE chat_channel_members
      SET last_viewed_at = $3,
          last_read_at = CASE WHEN last_read_at IS NULL OR last_read_at < $3::timestamptz THEN $3 ELSE last_read_at END,
          last_read_message_id = CASE WHEN last_read_at IS NULL OR last_read_at < $3::timestamptz THEN $4 ELSE last_read_message_id END,
          manually_unread = false
      WHERE channel_id = $1
        AND user_id = $2
    `,
    [input.channelId, actorUserId, input.readAt, input.messageId],
  );
}

export async function createNotificationEvent(input: NotificationEventInput): Promise<AppNotification[]> {
  const teamId = input.teamId;
  const actor = await ensureSystemBotActor(teamId);
  const body = notificationBody(input);
  const notifications: AppNotification[] = [];

  if (input.stream === "teamAnnouncement") {
    const channelId = await ensureTeamAnnouncementChannel({ actor, teamId });
    const metadata = systemMetadata(input);
    const result = await sendChatMessage({ body, channelId, source: "system", systemMetadata: metadata }, actor);
    if (result.status !== "ok") {
      throw new Error(`System chat announcement delivery failed with status ${result.status}`);
    }
    await markActorRead({
      actorUserId: input.actorUserId,
      channelId,
      messageId: result.message.id,
      readAt: result.message.createdAt,
    });
    return [];
  }

  const recipientUserIds = uniqueRecipients(input.recipientUserIds, input.actorUserId);
  for (const recipientUserId of recipientUserIds) {
    const channelId = await ensurePersonalNotificationChannel({ actor, recipientUserId, teamId });
    if (!channelId) continue;
    const metadata = systemMetadata(input, recipientUserId);
    const result = await sendChatMessage({ body, channelId, source: "system", systemMetadata: metadata }, actor);
    if (result.status !== "ok") {
      throw new Error(`System chat notification delivery failed with status ${result.status}`);
    }
    notifications.push({
      id: result.message.id,
      kind: input.kind,
      recipientUserId,
      actorUserId: input.actorUserId?.trim() || null,
      actorName: input.actorName.trim(),
      title: input.title.trim(),
      body: result.message.body,
      stream: input.stream,
      targetType: input.targetType,
      targetId: input.targetId,
      targetHref: input.targetHref,
      replyTargetType: input.replyTargetType ?? null,
      replyTargetId: input.replyTargetId ?? null,
      readAt: null,
      createdAt: result.message.createdAt,
      metadata: input.metadata ?? {},
    });
  }
  return notifications;
}

export async function getActiveAdminNotificationRecipients(teamId: string): Promise<string[]> {
  const { rows } = await pool.query<{ id: string }>(
    `
      SELECT u.id
      FROM team_members tm
      INNER JOIN users u ON u.id = tm.user_id
      WHERE tm.team_id = $1
        AND tm.role = 'admin'
        AND COALESCE(u.status, 'active') = 'active'
    `,
    [teamId],
  );
  return rows.map((row) => row.id);
}

export async function getActiveTeamNotificationRecipients(teamId: string): Promise<string[]> {
  const { rows } = await pool.query<{ id: string }>(
    `
      SELECT u.id
      FROM team_members tm
      INNER JOIN users u ON u.id = tm.user_id
      WHERE tm.team_id = $1
        AND COALESCE(u.status, 'active') = 'active'
    `,
    [teamId],
  );
  return rows.map((row) => row.id);
}

export async function getActiveMemberNotificationRecipientsByNames(teamId: string, memberNames: string[]): Promise<string[]> {
  const names = Array.from(new Set(memberNames.map((name) => name.trim()).filter(Boolean)));
  if (names.length === 0) return [];
  const { rows } = await pool.query<{ id: string }>(
    `
      SELECT u.id
      FROM team_members tm
      INNER JOIN users u ON u.id = tm.user_id
      WHERE tm.team_id = $1
        AND COALESCE(u.status, 'active') = 'active'
        AND u.name = ANY($2::text[])
    `,
    [teamId, names],
  );
  return rows.map((row) => row.id);
}

export async function getActiveMemberNotificationRecipientsByIds(teamId: string, userIds: string[]): Promise<string[]> {
  const ids = Array.from(new Set(userIds.map((id) => id.trim()).filter(Boolean)));
  if (ids.length === 0) return [];
  const { rows } = await pool.query<{ id: string }>(
    `
      SELECT u.id
      FROM team_members tm
      INNER JOIN users u ON u.id = tm.user_id
      WHERE tm.team_id = $1
        AND COALESCE(u.status, 'active') = 'active'
        AND u.id = ANY($2::uuid[])
    `,
    [teamId, ids],
  );
  return rows.map((row) => row.id);
}

export async function getUserNameById(userId: string | null | undefined): Promise<string> {
  const id = userId?.trim();
  if (!id) return "";
  const { rows } = await pool.query<{ name: string }>("SELECT name FROM users WHERE id = $1 LIMIT 1", [id]);
  return rows[0]?.name ?? "";
}

async function systemChatMessageProjection(input: { messageId: string; userId: string; scope: RuntimeScope }) {
  const teamId = runtimeScopeStorageId(input.scope);
  const { rows } = await pool.query<SystemChatMessageProjectionRow>(
    `
      SELECT
        m.id,
        m.channel_id,
        m.body,
        m.created_at,
        m.system_metadata,
        c.system_kind AS channel_system_kind,
        cm.user_id::text AS recipient_user_id,
        cm.last_read_at,
        m.system_metadata->>'notificationEventId' AS notification_event_id,
        m.system_metadata->>'actorName' AS actor_name,
        m.system_metadata->>'actorUserId' AS actor_user_id,
        m.system_metadata->>'title' AS title,
        m.system_metadata->>'targetType' AS target_type,
        m.system_metadata->>'targetId' AS target_id,
        m.system_metadata->>'targetHref' AS target_href,
        m.system_metadata->>'targetTitle' AS target_title,
        m.system_metadata->>'replyTargetType' AS reply_target_type,
        m.system_metadata->>'replyTargetId' AS reply_target_id
      FROM chat_messages m
      INNER JOIN chat_channels c ON c.id = m.channel_id
      INNER JOIN chat_channel_members cm ON cm.channel_id = c.id AND cm.user_id = $2
      WHERE m.team_id = $1
        AND m.source = 'system'
        AND m.root_message_id IS NULL
        AND m.deleted_at IS NULL
        AND c.system_kind IS NOT NULL
        AND (m.id = $3 OR m.system_metadata->>'notificationEventId' = $3)
      LIMIT 1
    `,
    [teamId, input.userId, input.messageId],
  );
  return rows[0] ?? null;
}

export async function listNotificationsForUser(userId: string, scope: RuntimeScope, limit = 50): Promise<AppNotification[]> {
  const teamId = runtimeScopeStorageId(scope);
  const { rows } = await pool.query<SystemChatMessageProjectionRow>(
    `
      SELECT
        m.id,
        m.channel_id,
        m.body,
        m.created_at,
        m.system_metadata,
        c.system_kind AS channel_system_kind,
        cm.user_id::text AS recipient_user_id,
        cm.last_read_at,
        m.system_metadata->>'notificationEventId' AS notification_event_id,
        m.system_metadata->>'actorName' AS actor_name,
        m.system_metadata->>'actorUserId' AS actor_user_id,
        m.system_metadata->>'title' AS title,
        m.system_metadata->>'targetType' AS target_type,
        m.system_metadata->>'targetId' AS target_id,
        m.system_metadata->>'targetHref' AS target_href,
        m.system_metadata->>'targetTitle' AS target_title,
        m.system_metadata->>'replyTargetType' AS reply_target_type,
        m.system_metadata->>'replyTargetId' AS reply_target_id
      FROM chat_messages m
      INNER JOIN chat_channels c ON c.id = m.channel_id
      INNER JOIN chat_channel_members cm ON cm.channel_id = c.id AND cm.user_id = $2
      WHERE m.team_id = $1
        AND m.source = 'system'
        AND m.root_message_id IS NULL
        AND m.deleted_at IS NULL
        AND c.system_kind IS NOT NULL
      ORDER BY m.created_at DESC, m.id DESC
      LIMIT $3
    `,
    [teamId, userId, Math.max(1, Math.min(100, limit))],
  );
  return rows.map((row) => toNotification(row, userId));
}

export async function getNotificationForUser(notificationId: string, userId: string, scope: RuntimeScope): Promise<AppNotification | null> {
  const row = await systemChatMessageProjection({ messageId: notificationId, scope, userId });
  return row ? toNotification(row, userId) : null;
}

export async function getUnreadNotificationCount(userId: string, scope: RuntimeScope): Promise<number> {
  const teamId = runtimeScopeStorageId(scope);
  const { rows } = await pool.query<{ count: number }>(
    `
      SELECT count(*)::int AS count
      FROM chat_messages m
      INNER JOIN chat_channels c ON c.id = m.channel_id
      INNER JOIN chat_channel_members cm ON cm.channel_id = c.id AND cm.user_id = $2
      WHERE m.team_id = $1
        AND m.source = 'system'
        AND m.root_message_id IS NULL
        AND m.deleted_at IS NULL
        AND c.system_kind IS NOT NULL
        AND m.author_user_id <> $2
        AND (cm.last_read_at IS NULL OR m.created_at > cm.last_read_at)
    `,
    [teamId, userId],
  );
  return Number(rows[0]?.count ?? 0);
}

export async function markNotificationRead(notificationId: string, userId: string, scope: RuntimeScope): Promise<AppNotification | null> {
  const row = await systemChatMessageProjection({ messageId: notificationId, scope, userId });
  if (!row) return null;
  const readAt = nowIso();
  await pool.query(
    `
      UPDATE chat_channel_members
      SET last_viewed_at = $3,
          last_read_at = CASE WHEN last_read_at IS NULL OR last_read_at < $4::timestamptz THEN $4 ELSE last_read_at END,
          last_read_message_id = CASE WHEN last_read_at IS NULL OR last_read_at < $4::timestamptz THEN $5 ELSE last_read_message_id END,
          manually_unread = false
      WHERE channel_id = $1
        AND user_id = $2
    `,
    [row.channel_id, userId, readAt, row.created_at, row.id],
  );
  return toNotification({ ...row, last_read_at: row.created_at }, userId);
}

export async function markNotificationUnread(notificationId: string, userId: string, scope: RuntimeScope): Promise<AppNotification | null> {
  const row = await systemChatMessageProjection({ messageId: notificationId, scope, userId });
  if (!row) return null;
  const teamId = runtimeScopeStorageId(scope);
  const previous = await pool.query<{ created_at: Date | string; id: string }>(
    `
      SELECT id, created_at
      FROM chat_messages
      WHERE team_id = $1
        AND channel_id = $2
        AND root_message_id IS NULL
        AND deleted_at IS NULL
        AND created_at < $3
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `,
    [teamId, row.channel_id, row.created_at],
  );
  await pool.query(
    `
      UPDATE chat_channel_members
      SET last_read_at = $3,
          last_read_message_id = $4,
          manually_unread = true
      WHERE channel_id = $1
        AND user_id = $2
    `,
    [row.channel_id, userId, previous.rows[0]?.created_at ?? null, previous.rows[0]?.id ?? null],
  );
  return toNotification({ ...row, last_read_at: null }, userId);
}

export async function markAllNotificationsRead(userId: string, scope: RuntimeScope): Promise<number> {
  const teamId = runtimeScopeStorageId(scope);
  const { rows } = await pool.query<{ channel_id: string; latest_created_at: Date | string; latest_message_id: string; unread_count: number }>(
    `
      WITH unread AS (
        SELECT m.channel_id, m.id, m.created_at
        FROM chat_messages m
        INNER JOIN chat_channels c ON c.id = m.channel_id
        INNER JOIN chat_channel_members cm ON cm.channel_id = c.id AND cm.user_id = $2
        WHERE m.team_id = $1
          AND m.source = 'system'
          AND m.root_message_id IS NULL
          AND m.deleted_at IS NULL
          AND c.system_kind IS NOT NULL
          AND m.author_user_id <> $2
          AND (cm.last_read_at IS NULL OR m.created_at > cm.last_read_at)
      ),
      latest AS (
        SELECT DISTINCT ON (channel_id)
          channel_id,
          id AS latest_message_id,
          created_at AS latest_created_at,
          count(*) OVER (PARTITION BY channel_id)::int AS unread_count
        FROM unread
        ORDER BY channel_id, created_at DESC, id DESC
      )
      SELECT * FROM latest
    `,
    [teamId, userId],
  );
  for (const row of rows) {
    await pool.query(
      `
        UPDATE chat_channel_members
        SET last_viewed_at = $3,
            last_read_at = CASE WHEN last_read_at IS NULL OR last_read_at < $4::timestamptz THEN $4 ELSE last_read_at END,
            last_read_message_id = CASE WHEN last_read_at IS NULL OR last_read_at < $4::timestamptz THEN $5 ELSE last_read_message_id END,
            manually_unread = false
        WHERE channel_id = $1
          AND user_id = $2
      `,
      [row.channel_id, userId, nowIso(), row.latest_created_at, row.latest_message_id],
    );
  }
  return rows.reduce((sum, row) => sum + Number(row.unread_count), 0);
}

export async function getSystemChatActorForUser(userId: string, scope: RuntimeScope): Promise<ChatActor | null> {
  const teamId = runtimeScopeStorageId(scope);
  const { rows } = await pool.query<{ id: string; name: string; role: string }>(
    `
      SELECT u.id, u.name, tm.role
      FROM users u
      INNER JOIN team_members tm ON tm.user_id = u.id AND tm.team_id = $2
      WHERE u.id = $1
        AND COALESCE(u.status, 'active') = 'active'
      LIMIT 1
    `,
    [userId, teamId],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    role: row.role === "admin" ? "admin" : "member",
    scope: runtimeScope(teamId),
    canCreatePrivateChannel: false,
    canCreatePublicChannel: false,
    canManageAnyChannel: false,
    canManageAnyMembers: false,
    canRead: true,
    canWrite: true,
  };
}
