import type { PoolClient } from "pg";
import type { ChatMessageSystemMetadata, NotificationStream } from "../../src/types/orf";
import { pool } from "../db/client";
import { ensureOrfChatBotActor } from "../integrations/orf-chat-delivery";
import {
  E2E_NOTIFICATION_ACTOR_NAME_SQL_PATTERN,
  normalizedE2eNotificationViewerEmails,
  visibleSystemNotificationMessageSql,
} from "../notifications/notificationIsolationPolicy";
import { sendChatMessage } from "../repositories/chatRepository";
import { makeId, nowIso, stableConversationName, type ChatActor } from "../repositories/chatRepositoryModel";
import { runtimeScope } from "../repositories/runtimeScope";

const SYSTEM_BOT_EMAIL = "orf-system@orf.local";
const SYSTEM_BOT_NAME = "ORF 系统通知";
const SYSTEM_ANNOUNCEMENT_CHANNEL_NAME = "orf-system-announcements";
const SYSTEM_ANNOUNCEMENT_TITLE = "系统公告";
const PERSONAL_NOTIFICATION_TITLE = "我的系统通知";

type ExistingNotificationChatProjectionMessage = {
  channel_id: string;
  created_at: Date | string;
  id: string;
};

async function findExistingSystemBotActor(teamId: string): Promise<ChatActor | null> {
  const { rows } = await pool.query<{ id: string; name: string; role: string | null }>(
    `
      SELECT u.id, u.name, tm.role
      FROM chat_channels c
      INNER JOIN users u ON u.id = c.created_by
      LEFT JOIN team_members tm ON tm.team_id = c.team_id AND tm.user_id = u.id
      WHERE c.team_id = $1
        AND c.system_kind IS NOT NULL
        AND c.created_by IS NOT NULL
        AND c.archived_at IS NULL
        AND COALESCE(u.status, 'active') = 'active'
      ORDER BY (tm.team_id IS NOT NULL) DESC, c.created_at ASC, c.id ASC
      LIMIT 1
    `,
    [teamId],
  );
  const row = rows[0];
  if (!row) return null;
  await pool.query(
    `
      INSERT INTO team_members (team_id, user_id, role)
      VALUES ($1, $2, 'member')
      ON CONFLICT (team_id, user_id) DO NOTHING
    `,
    [teamId, row.id],
  );
  return {
    id: row.id,
    name: row.name || SYSTEM_BOT_NAME,
    role: row.role === "admin" ? "admin" : "member",
    scope: runtimeScope(teamId),
    canCreatePrivateChannel: true,
    canCreatePublicChannel: true,
    canManageAnyChannel: false,
    canManageAnyMembers: false,
    canRead: true,
    canWrite: true,
  };
}

export async function ensureNotificationChatProjectionActor(teamId: string) {
  return await findExistingSystemBotActor(teamId) ?? ensureOrfChatBotActor({
    botEmail: SYSTEM_BOT_EMAIL,
    botName: SYSTEM_BOT_NAME,
    teamId,
  });
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
    `,
    [
      channelId,
      input.teamId,
      SYSTEM_ANNOUNCEMENT_CHANNEL_NAME,
      SYSTEM_ANNOUNCEMENT_TITLE,
      "全体可见的系统公告和公共业务事件",
      "系统通知事件投影到这个频道；通知事实以 notification_events 为准。",
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
      "系统通知事件投影到这个会话；通知事实以 notification_events 为准。",
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

async function ensureProjectNotificationChannel(input: { actor: ChatActor; channelId: string; teamId: string }) {
  const { rows } = await pool.query<{ id: string }>(
    `
      SELECT id
      FROM chat_channels
      WHERE team_id = $1
        AND id = $2
        AND system_kind IS NULL
        AND type IN ('public', 'private')
        AND archived_at IS NULL
      LIMIT 1
    `,
    [input.teamId, input.channelId],
  );
  const channelId = rows[0]?.id;
  if (!channelId) return null;

  const now = nowIso();
  await pool.query(
    `
      INSERT INTO chat_channel_members (channel_id, user_id, role, favorite, muted, manually_unread, joined_at)
      VALUES ($1, $2, 'member', false, false, false, $3)
      ON CONFLICT (channel_id, user_id) DO NOTHING
    `,
    [channelId, input.actor.id, now],
  );
  return channelId;
}

export async function ensureNotificationChatProjectionChannel(input: {
  actor: ChatActor;
  destinationId?: string | null;
  recipientUserId?: string | null;
  stream: NotificationStream;
  teamId: string;
}) {
  const destinationId = input.destinationId?.trim();
  const recipientUserId = input.recipientUserId?.trim();
  if (destinationId) {
    return ensureProjectNotificationChannel({ actor: input.actor, channelId: destinationId, teamId: input.teamId });
  }
  if (recipientUserId) {
    return ensurePersonalNotificationChannel({ actor: input.actor, recipientUserId, teamId: input.teamId });
  }
  if (input.stream === "teamAnnouncement") {
    return ensureTeamAnnouncementChannel({ actor: input.actor, teamId: input.teamId });
  }
  return null;
}

export async function findExistingNotificationChatProjectionMessage(input: {
  destinationId?: string | null;
  eventId: string;
  recipientUserId?: string | null;
  teamId: string;
}): Promise<ExistingNotificationChatProjectionMessage | null> {
  const destinationId = input.destinationId?.trim();
  const recipientUserId = input.recipientUserId?.trim();
  const recipientFilter = destinationId
    ? "AND c.id = $3"
    : recipientUserId
      ? "AND c.system_kind = 'personalNotification' AND c.system_recipient_user_id = $3"
      : "AND c.system_kind = 'teamAnnouncement'";
  const params = destinationId
    ? [input.teamId, input.eventId, destinationId]
    : recipientUserId
      ? [input.teamId, input.eventId, recipientUserId]
      : [input.teamId, input.eventId];
  const { rows } = await pool.query<ExistingNotificationChatProjectionMessage>(
    `
      SELECT m.id, m.channel_id, m.created_at
      FROM chat_messages m
      INNER JOIN chat_channels c ON c.id = m.channel_id
      WHERE m.team_id = $1
        AND m.source = 'system'
        AND m.root_message_id IS NULL
        AND m.deleted_at IS NULL
        AND m.system_metadata->>'notificationEventId' = $2
        ${recipientFilter}
      ORDER BY m.created_at ASC, m.id ASC
      LIMIT 1
    `,
    params,
  );
  return rows[0] ?? null;
}

export async function sendNotificationChatProjectionMessage(input: {
  actor: ChatActor;
  body: string;
  channelId: string;
  createdAt: string;
  systemMetadata: ChatMessageSystemMetadata;
}) {
  const result = await sendChatMessage({
    body: input.body,
    channelId: input.channelId,
    createdAt: input.createdAt,
    source: "system",
    systemMetadata: input.systemMetadata,
  }, input.actor);
  if (result.status !== "ok") {
    throw new Error(`System chat delivery failed with status ${result.status}`);
  }
  return { createdAt: result.message.createdAt, id: result.message.id };
}

export async function listReadNotificationProjectionEventIds(
  client: PoolClient,
  input: { actor: ChatActor; channelId: string; readThroughAt: Date | string; teamId: string },
) {
  const { rows } = await client.query<{ event_id: string }>(
    `
      SELECT DISTINCT NULLIF(m.system_metadata->>'notificationEventId', '') AS event_id
      FROM chat_messages m
      WHERE m.team_id = $1
        AND m.channel_id = $2
        AND m.source = 'system'
        AND m.root_message_id IS NULL
        AND m.deleted_at IS NULL
        AND m.created_at <= $3::timestamptz
        AND NULLIF(m.system_metadata->>'notificationEventId', '') IS NOT NULL
        AND ${visibleSystemNotificationMessageSql({
          actorNamePatternParam: "$4",
          messageSql: "m",
          recipientUserIdParam: "$5",
          viewerEmailsParam: "$6",
        })}
    `,
    [
      input.teamId,
      input.channelId,
      input.readThroughAt,
      E2E_NOTIFICATION_ACTOR_NAME_SQL_PATTERN,
      input.actor.id,
      normalizedE2eNotificationViewerEmails(),
    ],
  );
  return rows.map((row) => row.event_id);
}

export async function findNotificationProjectionEventIdForMessage(
  client: PoolClient,
  input: { actor: ChatActor; channelId: string; messageId: string; teamId: string },
) {
  const { rows } = await client.query<{ event_id: string | null }>(
    `
      SELECT NULLIF(m.system_metadata->>'notificationEventId', '') AS event_id
      FROM chat_messages m
      WHERE m.team_id = $1
        AND m.channel_id = $2
        AND m.id = $3
        AND m.source = 'system'
        AND m.root_message_id IS NULL
        AND m.deleted_at IS NULL
        AND ${visibleSystemNotificationMessageSql({
          actorNamePatternParam: "$4",
          messageSql: "m",
          recipientUserIdParam: "$5",
          viewerEmailsParam: "$6",
        })}
      LIMIT 1
    `,
    [
      input.teamId,
      input.channelId,
      input.messageId,
      E2E_NOTIFICATION_ACTOR_NAME_SQL_PATTERN,
      input.actor.id,
      normalizedE2eNotificationViewerEmails(),
    ],
  );
  return rows[0]?.event_id?.trim() || null;
}
