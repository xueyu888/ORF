import type {
  AppNotification,
  CommentTargetType,
  NotificationKind,
  NotificationStream,
  NotificationTargetType,
} from "../../src/types/orf";
import type { PoolClient } from "pg";
import { pool } from "../db/client";
import { ensureOrfChatBotActor } from "../integrations/orf-chat-delivery";
import {
  buildNotificationSystemMetadata,
  formatNotificationChatBody,
  notificationChatDeliveryId,
  resolveNotificationRecipients,
  type NotificationDeliveryStatus,
  type NotificationMetadataInput,
  type NotificationRecipientFact,
} from "../notifications/notificationEventModel";
import {
  E2E_NOTIFICATION_ACTOR_NAME_SQL_PATTERN,
  e2eNotificationRecipientVisibilitySql,
  isE2eNotificationActorName,
  normalizedE2eNotificationViewerEmails,
} from "../notifications/notificationIsolationPolicy";
import { publishRealtimeNotification } from "../realtime/realtimeEventBus";
import { sendChatMessage, type ChatActor } from "./chatRepository";
import { makeId, nowIso, stableConversationName } from "./chatRepositoryModel";
import type { RuntimeScope } from "./runtimeScope";
import { runtimeScope, runtimeScopeStorageId } from "./runtimeScope";

export type NotificationEventInput = {
  actorName: string;
  actorUserId?: string | null;
  body: string;
  destinationChannelIds?: string[];
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

type NotificationEventRow = {
  actor_name: string;
  actor_user_id: string | null;
  body: string;
  created_at: Date | string;
  delivered_at: Date | string;
  id: string;
  kind: NotificationKind;
  metadata: Record<string, string> | null;
  read_at: Date | string | null;
  recipient_user_id: string;
  reply_target_id: string | null;
  reply_target_type: CommentTargetType | null;
  stream: NotificationStream;
  target_href: string;
  target_id: string;
  target_type: NotificationTargetType;
  team_id: string;
  title: string;
};

type NotificationReceiptRow = {
  delivered_at: Date | string;
  read_at: Date | string | null;
  recipient_user_id: string;
};

type NotificationDeliveryEventRow = {
  actor_name: string;
  actor_user_id: string | null;
  attempts: number;
  body: string;
  delivery_id: string;
  delivery_destination_id: string | null;
  delivery_recipient_user_id: string | null;
  delivery_status: NotificationDeliveryStatus;
  event_created_at: Date | string;
  event_id: string;
  kind: NotificationKind;
  metadata: Record<string, string> | null;
  reply_target_id: string | null;
  reply_target_type: CommentTargetType | null;
  stream: NotificationStream;
  target_href: string;
  target_id: string;
  target_type: NotificationTargetType;
  team_id: string;
  title: string;
};

type ExistingSystemChatMessageRow = {
  channel_id: string;
  created_at: Date | string;
  id: string;
};

const SYSTEM_BOT_EMAIL = "orf-system@orf.local";
const SYSTEM_BOT_NAME = "ORF 系统通知";
const SYSTEM_ANNOUNCEMENT_CHANNEL_NAME = "orf-system-announcements";
const SYSTEM_ANNOUNCEMENT_TITLE = "系统公告";
const PERSONAL_NOTIFICATION_TITLE = "我的系统通知";
const DELIVERY_RETRY_BASE_MS = 60_000;
const DELIVERY_RETRY_MAX_MS = 30 * 60_000;

function iso(value: Date | string | null | undefined) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function metadataInputFromDelivery(row: NotificationDeliveryEventRow): NotificationMetadataInput {
  return {
    actorName: row.actor_name,
    actorUserId: row.actor_user_id,
    body: row.body,
    kind: row.kind,
    metadata: row.metadata ?? {},
    replyTargetId: row.reply_target_id,
    replyTargetType: row.reply_target_type,
    stream: row.stream,
    targetHref: row.target_href,
    targetId: row.target_id,
    targetType: row.target_type,
    title: row.title,
  };
}

function toNotification(row: NotificationEventRow): AppNotification {
  return {
    id: row.id,
    kind: row.kind,
    recipientUserId: row.recipient_user_id,
    actorUserId: row.actor_user_id,
    actorName: row.actor_name || SYSTEM_BOT_NAME,
    title: row.title,
    body: row.body,
    stream: row.stream,
    targetType: row.target_type,
    targetId: row.target_id,
    targetHref: row.target_href,
    replyTargetType: row.reply_target_type,
    replyTargetId: row.reply_target_id,
    readAt: iso(row.read_at),
    createdAt: iso(row.created_at) ?? nowIso(),
    metadata: row.metadata ?? {},
  };
}

function deliveryErrorText(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 500);
}

function uniqueTextValues(values: readonly string[] | undefined) {
  return Array.from(new Set((values ?? []).map((value) => value.trim()).filter(Boolean)));
}

function nextDeliveryRetryAt(attempts: number) {
  const delayMs = Math.min(DELIVERY_RETRY_MAX_MS, Math.max(DELIVERY_RETRY_BASE_MS, attempts * DELIVERY_RETRY_BASE_MS));
  return new Date(Date.now() + delayMs).toISOString();
}

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

async function ensureSystemBotActor(teamId: string) {
  return await findExistingSystemBotActor(teamId) ?? ensureOrfChatBotActor({
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

async function markActorRead(input: { actorUserId?: string | null; channelId: string; messageId: string; readAt: string }) {
  const actorUserId = input.actorUserId?.trim();
  if (!actorUserId) return;
  const readStateUpdatedAt = nowIso();
  await pool.query(
    `
      UPDATE chat_channel_members
      SET last_viewed_at = CASE WHEN last_viewed_at IS NULL OR last_viewed_at < $5::timestamptz THEN $5 ELSE last_viewed_at END,
          last_read_at = CASE WHEN last_read_at IS NULL OR last_read_at < $3::timestamptz THEN $3 ELSE last_read_at END,
          last_read_message_id = CASE WHEN last_read_at IS NULL OR last_read_at < $3::timestamptz THEN $4 ELSE last_read_message_id END,
          manually_unread = false
      WHERE channel_id = $1
        AND user_id = $2
    `,
    [input.channelId, actorUserId, input.readAt, input.messageId, readStateUpdatedAt],
  );
}

async function loadNotificationActorIsolationName(
  client: PoolClient,
  input: { actorName: string; actorUserId?: string | null },
) {
  const actorUserId = input.actorUserId?.trim();
  if (!actorUserId) return input.actorName;
  const { rows } = await client.query<{ name: string }>("SELECT name FROM users WHERE id = $1 LIMIT 1", [actorUserId]);
  return rows[0]?.name?.trim() || input.actorName;
}

async function insertNotificationEvent(input: NotificationEventInput, eventId: string, createdAt: string, recipients: NotificationRecipientFact[]) {
  const client = await pool.connect();
  const actorName = input.actorName.trim();
  try {
    await client.query("BEGIN");
    const actorIsolationName = await loadNotificationActorIsolationName(client, {
      actorName,
      actorUserId: input.actorUserId,
    });
    const isolatedE2eActor = isE2eNotificationActorName(actorIsolationName);
    const destinationChannelIds = uniqueTextValues(input.destinationChannelIds);
    await client.query(
      `
        INSERT INTO notification_events (
          id, team_id, stream, actor_user_id, actor_name, kind, title, body,
          target_type, target_id, target_href, reply_target_type, reply_target_id,
          created_at, metadata
        )
        VALUES ($1, $2, $3::notification_stream, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb)
      `,
      [
        eventId,
        input.teamId,
        input.stream,
        input.actorUserId?.trim() || null,
        actorName,
        input.kind,
        input.title.trim(),
        input.body.trim(),
        input.targetType,
        input.targetId,
        input.targetHref,
        input.replyTargetType ?? null,
        input.replyTargetId ?? null,
        createdAt,
        JSON.stringify(input.metadata ?? {}),
      ],
    );

    if (recipients.length > 0) {
      const receiptRows = await client.query<NotificationReceiptRow>(
        `
          WITH input_recipients AS (
            SELECT *
            FROM unnest($3::uuid[], $4::timestamptz[]) AS item(user_id, read_at)
          )
          INSERT INTO notification_receipts (event_id, recipient_user_id, read_at, delivered_at)
          SELECT $1, u.id, input_recipients.read_at, $5
          FROM input_recipients
          INNER JOIN users u ON u.id = input_recipients.user_id
          INNER JOIN team_members tm ON tm.user_id = u.id AND tm.team_id = $2
          WHERE COALESCE(u.status, 'active') = 'active'
            AND ${e2eNotificationRecipientVisibilitySql({
              actorNamePatternParam: "$7",
              actorNameSql: "$6::text",
              recipientEmailSql: "u.email",
              recipientNameSql: "u.name",
              viewerEmailsParam: "$8",
            })}
          ON CONFLICT (event_id, recipient_user_id) DO NOTHING
          RETURNING recipient_user_id::text, read_at, delivered_at
        `,
        [
          eventId,
          input.teamId,
          recipients.map((recipient) => recipient.userId),
          recipients.map((recipient) => recipient.readAt),
          createdAt,
          actorIsolationName,
          E2E_NOTIFICATION_ACTOR_NAME_SQL_PATTERN,
          normalizedE2eNotificationViewerEmails(),
        ],
      );

      if ((input.stream === "personalNotification" || isolatedE2eActor) && receiptRows.rows.length > 0) {
        await client.query(
          `
            WITH input_deliveries AS (
              SELECT *
              FROM unnest($2::text[], $3::uuid[]) AS item(id, recipient_user_id)
            )
            INSERT INTO notification_deliveries (
              id, event_id, recipient_user_id, channel, status, attempts,
              created_at, updated_at
            )
            SELECT id, $1, recipient_user_id, 'chat', 'pending', 0, $4, $4
            FROM input_deliveries
            ON CONFLICT DO NOTHING
          `,
          [
            eventId,
            receiptRows.rows.map((row) => notificationChatDeliveryId(eventId, row.recipient_user_id)),
            receiptRows.rows.map((row) => row.recipient_user_id),
            createdAt,
          ],
        );
      }
    }

    if (input.stream === "teamAnnouncement" && !isolatedE2eActor) {
      await client.query(
        `
          INSERT INTO notification_deliveries (
            id, event_id, recipient_user_id, channel, status, attempts,
            created_at, updated_at
          )
          VALUES ($1, $2, null, 'chat', 'pending', 0, $3, $3)
          ON CONFLICT DO NOTHING
        `,
        [notificationChatDeliveryId(eventId), eventId, createdAt],
      );
    }

    if (destinationChannelIds.length > 0 && !isolatedE2eActor) {
      await client.query(
        `
          WITH input_deliveries AS (
            SELECT *
            FROM unnest($2::text[], $3::text[]) AS item(id, destination_id)
          )
          INSERT INTO notification_deliveries (
            id, event_id, recipient_user_id, channel, status, destination_id, attempts,
            created_at, updated_at
          )
          SELECT id, $1, null, 'chat', 'pending', destination_id, 0, $4, $4
          FROM input_deliveries
          ON CONFLICT DO NOTHING
        `,
        [
          eventId,
          destinationChannelIds.map((destinationId) => notificationChatDeliveryId(eventId, null, destinationId)),
          destinationChannelIds,
          createdAt,
        ],
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function listNotificationsForEvent(eventId: string): Promise<AppNotification[]> {
  const { rows } = await pool.query<NotificationEventRow>(
    `
      SELECT
        e.id,
        e.team_id,
        e.stream,
        e.actor_user_id::text,
        e.actor_name,
        e.kind,
        e.title,
        e.body,
        e.target_type,
        e.target_id,
        e.target_href,
        e.reply_target_type,
        e.reply_target_id,
        e.created_at,
        e.metadata,
        r.recipient_user_id::text,
        r.read_at,
        r.delivered_at
      FROM notification_events e
      INNER JOIN notification_receipts r ON r.event_id = e.id
      WHERE e.id = $1
      ORDER BY r.delivered_at DESC, r.recipient_user_id
    `,
    [eventId],
  );
  return rows.map(toNotification);
}

export async function createNotificationEvent(input: NotificationEventInput): Promise<AppNotification[]> {
  const createdAt = nowIso();
  const destinationChannelIds = uniqueTextValues(input.destinationChannelIds);
  const recipients = resolveNotificationRecipients({
    actorUserId: input.actorUserId,
    createdAt,
    recipientUserIds: input.recipientUserIds,
    stream: input.stream,
  });
  if (input.stream === "personalNotification" && recipients.length === 0 && destinationChannelIds.length === 0) {
    return [];
  }

  const eventId = makeId("nevt");
  await insertNotificationEvent({ ...input, destinationChannelIds }, eventId, createdAt, recipients);
  const notifications = await listNotificationsForEvent(eventId);
  for (const notification of notifications) {
    publishRealtimeNotification(input.teamId, notification);
  }
  await flushNotificationChatDeliveriesForEvent(eventId).catch(() => undefined);
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

export async function getProjectChatNotificationChannelIds(teamId: string, projectId?: string | null): Promise<string[]> {
  const normalizedProjectId = projectId?.trim();
  if (!normalizedProjectId) return [];

  const { rows } = await pool.query<{ id: string }>(
    `
      SELECT id
      FROM chat_channels
      WHERE team_id = $1
        AND project_id = $2
        AND system_kind IS NULL
        AND type IN ('public', 'private')
        AND archived_at IS NULL
      ORDER BY updated_at DESC, created_at ASC, id
    `,
    [teamId, normalizedProjectId],
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

async function notificationReceiptProjection(input: { notificationId: string; userId: string; scope: RuntimeScope }) {
  const teamId = runtimeScopeStorageId(input.scope);
  const { rows } = await pool.query<NotificationEventRow>(
    `
      SELECT
        e.id,
        e.team_id,
        e.stream,
        e.actor_user_id::text,
        e.actor_name,
        e.kind,
        e.title,
        e.body,
        e.target_type,
        e.target_id,
        e.target_href,
        e.reply_target_type,
        e.reply_target_id,
        e.created_at,
        e.metadata,
        r.recipient_user_id::text,
        r.read_at,
        r.delivered_at
      FROM notification_events e
      INNER JOIN notification_receipts r ON r.event_id = e.id AND r.recipient_user_id = $2
      LEFT JOIN users actor ON actor.id = e.actor_user_id
      INNER JOIN users recipient ON recipient.id = r.recipient_user_id
      WHERE e.team_id = $1
        AND ${e2eNotificationRecipientVisibilitySql({
          actorNamePatternParam: "$4",
          actorNameSql: "coalesce(actor.name, e.actor_name)",
          recipientEmailSql: "recipient.email",
          recipientNameSql: "recipient.name",
          viewerEmailsParam: "$5",
        })}
        AND (
          e.id = $3
          OR EXISTS (
            SELECT 1
            FROM chat_messages m
            WHERE m.team_id = e.team_id
              AND m.source = 'system'
              AND m.system_metadata->>'notificationEventId' = e.id
              AND m.id = $3
          )
        )
      LIMIT 1
    `,
    [
      teamId,
      input.userId,
      input.notificationId,
      E2E_NOTIFICATION_ACTOR_NAME_SQL_PATTERN,
      normalizedE2eNotificationViewerEmails(),
    ],
  );
  return rows[0] ?? null;
}

export async function listNotificationsForUser(userId: string, scope: RuntimeScope, limit = 50): Promise<AppNotification[]> {
  const teamId = runtimeScopeStorageId(scope);
  const { rows } = await pool.query<NotificationEventRow>(
    `
      SELECT
        e.id,
        e.team_id,
        e.stream,
        e.actor_user_id::text,
        e.actor_name,
        e.kind,
        e.title,
        e.body,
        e.target_type,
        e.target_id,
        e.target_href,
        e.reply_target_type,
        e.reply_target_id,
        e.created_at,
        e.metadata,
        r.recipient_user_id::text,
        r.read_at,
        r.delivered_at
      FROM notification_events e
      INNER JOIN notification_receipts r ON r.event_id = e.id AND r.recipient_user_id = $2
      LEFT JOIN users actor ON actor.id = e.actor_user_id
      INNER JOIN users recipient ON recipient.id = r.recipient_user_id
      WHERE e.team_id = $1
        AND ${e2eNotificationRecipientVisibilitySql({
          actorNamePatternParam: "$4",
          actorNameSql: "coalesce(actor.name, e.actor_name)",
          recipientEmailSql: "recipient.email",
          recipientNameSql: "recipient.name",
          viewerEmailsParam: "$5",
        })}
      ORDER BY r.delivered_at DESC, e.created_at DESC, e.id DESC
      LIMIT $3
    `,
    [
      teamId,
      userId,
      Math.max(1, Math.min(100, limit)),
      E2E_NOTIFICATION_ACTOR_NAME_SQL_PATTERN,
      normalizedE2eNotificationViewerEmails(),
    ],
  );
  return rows.map(toNotification);
}

export async function getNotificationForUser(notificationId: string, userId: string, scope: RuntimeScope): Promise<AppNotification | null> {
  const row = await notificationReceiptProjection({ notificationId, scope, userId });
  return row ? toNotification(row) : null;
}

export async function getUnreadNotificationCount(userId: string, scope: RuntimeScope): Promise<number> {
  const teamId = runtimeScopeStorageId(scope);
  const { rows } = await pool.query<{ count: number }>(
    `
      SELECT count(*)::int AS count
      FROM notification_receipts r
      INNER JOIN notification_events e ON e.id = r.event_id
      LEFT JOIN users actor ON actor.id = e.actor_user_id
      INNER JOIN users recipient ON recipient.id = r.recipient_user_id
      WHERE e.team_id = $1
        AND r.recipient_user_id = $2
        AND r.read_at IS NULL
        AND ${e2eNotificationRecipientVisibilitySql({
          actorNamePatternParam: "$3",
          actorNameSql: "coalesce(actor.name, e.actor_name)",
          recipientEmailSql: "recipient.email",
          recipientNameSql: "recipient.name",
          viewerEmailsParam: "$4",
        })}
    `,
    [teamId, userId, E2E_NOTIFICATION_ACTOR_NAME_SQL_PATTERN, normalizedE2eNotificationViewerEmails()],
  );
  return Number(rows[0]?.count ?? 0);
}

export async function markNotificationRead(notificationId: string, userId: string, scope: RuntimeScope): Promise<AppNotification | null> {
  const row = await notificationReceiptProjection({ notificationId, scope, userId });
  if (!row) return null;
  const readAt = nowIso();
  await pool.query(
    `
      UPDATE notification_receipts
      SET read_at = $3
      WHERE event_id = $1
        AND recipient_user_id = $2
    `,
    [row.id, userId, readAt],
  );
  return toNotification({ ...row, read_at: readAt });
}

export async function markNotificationUnread(notificationId: string, userId: string, scope: RuntimeScope): Promise<AppNotification | null> {
  const row = await notificationReceiptProjection({ notificationId, scope, userId });
  if (!row) return null;
  await pool.query(
    `
      UPDATE notification_receipts
      SET read_at = null
      WHERE event_id = $1
        AND recipient_user_id = $2
    `,
    [row.id, userId],
  );
  return toNotification({ ...row, read_at: null });
}

export async function markAllNotificationsRead(userId: string, scope: RuntimeScope, stream?: NotificationStream): Promise<number> {
  const teamId = runtimeScopeStorageId(scope);
  const readAt = nowIso();
  const { rows } = await pool.query<{ count: number }>(
    `
      WITH updated AS (
        UPDATE notification_receipts r
        SET read_at = $3
        FROM notification_events e
        LEFT JOIN users actor ON actor.id = e.actor_user_id,
             users recipient
        WHERE e.id = r.event_id
          AND recipient.id = r.recipient_user_id
          AND e.team_id = $1
          AND r.recipient_user_id = $2
          AND r.read_at IS NULL
          AND ($4::text IS NULL OR e.stream::text = $4)
          AND ${e2eNotificationRecipientVisibilitySql({
            actorNamePatternParam: "$5",
            actorNameSql: "coalesce(actor.name, e.actor_name)",
            recipientEmailSql: "recipient.email",
            recipientNameSql: "recipient.name",
            viewerEmailsParam: "$6",
          })}
        RETURNING r.event_id
      )
      SELECT count(*)::int AS count
      FROM updated
    `,
    [
      teamId,
      userId,
      readAt,
      stream ?? null,
      E2E_NOTIFICATION_ACTOR_NAME_SQL_PATTERN,
      normalizedE2eNotificationViewerEmails(),
    ],
  );
  return Number(rows[0]?.count ?? 0);
}

async function findExistingSystemChatMessageForDelivery(row: NotificationDeliveryEventRow): Promise<ExistingSystemChatMessageRow | null> {
  const destinationId = row.delivery_destination_id?.trim();
  const recipientUserId = row.delivery_recipient_user_id?.trim();
  const recipientFilter = destinationId
    ? "AND c.id = $3"
    : recipientUserId
      ? "AND c.system_kind = 'personalNotification' AND c.system_recipient_user_id = $3"
      : "AND c.system_kind = 'teamAnnouncement'";
  const params = destinationId
    ? [row.team_id, row.event_id, destinationId]
    : recipientUserId
      ? [row.team_id, row.event_id, recipientUserId]
      : [row.team_id, row.event_id];
  const { rows } = await pool.query<ExistingSystemChatMessageRow>(
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

async function loadNotificationDeliveryEvent(deliveryId: string): Promise<NotificationDeliveryEventRow | null> {
  const { rows } = await pool.query<NotificationDeliveryEventRow>(
    `
      SELECT
        d.id AS delivery_id,
        d.destination_id AS delivery_destination_id,
        d.recipient_user_id::text AS delivery_recipient_user_id,
        d.status AS delivery_status,
        d.attempts,
        e.id AS event_id,
        e.team_id,
        e.stream,
        e.actor_user_id::text,
        e.actor_name,
        e.kind,
        e.title,
        e.body,
        e.target_type,
        e.target_id,
        e.target_href,
        e.reply_target_type,
        e.reply_target_id,
        e.created_at AS event_created_at,
        e.metadata
      FROM notification_deliveries d
      INNER JOIN notification_events e ON e.id = d.event_id
      WHERE d.id = $1
        AND d.channel = 'chat'
      LIMIT 1
    `,
    [deliveryId],
  );
  return rows[0] ?? null;
}

async function markNotificationDeliveryDelivered(input: {
  channelId: string;
  deliveredAt: string;
  deliveryId: string;
  messageId: string;
}) {
  await pool.query(
    `
      UPDATE notification_deliveries
      SET status = 'delivered',
          destination_id = $2,
          message_id = $3,
          attempts = attempts + 1,
          last_error = null,
          next_attempt_at = null,
          delivered_at = $4,
          updated_at = $4
      WHERE id = $1
    `,
    [input.deliveryId, input.channelId, input.messageId, input.deliveredAt],
  );
}

async function markNotificationDeliveryFailed(input: { attempts: number; deliveryId: string; error: unknown }) {
  const now = nowIso();
  await pool.query(
    `
      UPDATE notification_deliveries
      SET status = 'failed',
          attempts = attempts + 1,
          last_error = $2,
          next_attempt_at = $3,
          updated_at = $4
      WHERE id = $1
    `,
    [input.deliveryId, deliveryErrorText(input.error), nextDeliveryRetryAt(input.attempts + 1), now],
  );
}

async function deliverNotificationChatDelivery(deliveryId: string): Promise<"delivered" | "failed" | "skipped"> {
  const row = await loadNotificationDeliveryEvent(deliveryId);
  if (!row || row.delivery_status === "delivered") return "skipped";
  try {
    const existing = await findExistingSystemChatMessageForDelivery(row);
    if (existing) {
      await markNotificationDeliveryDelivered({
        channelId: existing.channel_id,
        deliveredAt: iso(existing.created_at) ?? nowIso(),
        deliveryId,
        messageId: existing.id,
      });
      return "delivered";
    }

    const actor = await ensureSystemBotActor(row.team_id);
    const metadataInput = metadataInputFromDelivery(row);
    const body = formatNotificationChatBody(metadataInput);
    let channelId: string | null;
    const destinationId = row.delivery_destination_id?.trim();
    const recipientUserId = row.delivery_recipient_user_id?.trim();
    if (destinationId) {
      channelId = await ensureProjectNotificationChannel({ actor, channelId: destinationId, teamId: row.team_id });
    } else if (recipientUserId) {
      channelId = recipientUserId ? await ensurePersonalNotificationChannel({ actor, recipientUserId, teamId: row.team_id }) : null;
    } else if (row.stream === "teamAnnouncement") {
      channelId = await ensureTeamAnnouncementChannel({ actor, teamId: row.team_id });
    } else {
      channelId = null;
    }
    if (!channelId) {
      throw new Error("Notification chat delivery has no active destination channel");
    }

    const metadata = buildNotificationSystemMetadata(metadataInput, row.event_id, row.delivery_recipient_user_id);
    const result = await sendChatMessage({
      body,
      channelId,
      createdAt: iso(row.event_created_at) ?? nowIso(),
      source: "system",
      systemMetadata: metadata,
    }, actor);
    if (result.status !== "ok") {
      throw new Error(`System chat delivery failed with status ${result.status}`);
    }

    await markNotificationDeliveryDelivered({
      channelId,
      deliveredAt: result.message.createdAt,
      deliveryId,
      messageId: result.message.id,
    });
    if (row.stream === "teamAnnouncement") {
      await markActorRead({
        actorUserId: row.actor_user_id,
        channelId,
        messageId: result.message.id,
        readAt: result.message.createdAt,
      });
    }
    return "delivered";
  } catch (error) {
    await markNotificationDeliveryFailed({ attempts: row.attempts, deliveryId, error }).catch(() => undefined);
    return "failed";
  }
}

async function flushNotificationChatDeliveriesForEvent(eventId: string) {
  const { rows } = await pool.query<{ id: string }>(
    `
      SELECT id
      FROM notification_deliveries
      WHERE event_id = $1
        AND channel = 'chat'
        AND status <> 'delivered'
      ORDER BY created_at ASC, id ASC
    `,
    [eventId],
  );
  for (const row of rows) {
    await deliverNotificationChatDelivery(row.id);
  }
}

export async function flushPendingNotificationChatDeliveries(limit = 50) {
  const { rows } = await pool.query<{ id: string }>(
    `
      SELECT id
      FROM notification_deliveries
      WHERE channel = 'chat'
        AND status IN ('pending', 'failed')
        AND (next_attempt_at IS NULL OR next_attempt_at <= now())
      ORDER BY created_at ASC, id ASC
      LIMIT $1
    `,
    [Math.max(1, Math.min(200, limit))],
  );
  let delivered = 0;
  let failed = 0;
  for (const row of rows) {
    const result = await deliverNotificationChatDelivery(row.id);
    if (result === "delivered") delivered += 1;
    if (result === "failed") failed += 1;
  }
  return { attempted: rows.length, delivered, failed };
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
