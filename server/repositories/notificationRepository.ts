import type {
  AppNotification,
  CommentTargetType,
  NotificationDeliveryClass,
  NotificationKind,
  NotificationReceiptAttentionLevel,
  NotificationStream,
  NotificationTargetType,
} from "../../src/types/orf";
import type { PoolClient } from "pg";
import { pool } from "../db/client";
import {
  notificationMetadataWithSystemReference,
  notificationChatDeliveryId,
  resolveNotificationRecipients,
  type NotificationDeliveryStatus,
  type NotificationRecipientFact,
  type NotificationRecipientInput,
  type NotificationSystemReferenceInput,
} from "../notifications/notificationEventModel";
import {
  E2E_NOTIFICATION_ACTOR_NAME_SQL_PATTERN,
  e2eNotificationRecipientVisibilitySql,
  isE2eNotificationActorName,
  normalizedE2eNotificationViewerEmails,
} from "../notifications/notificationIsolationPolicy";
import { publishRealtimeNotification } from "../realtime/realtimeEventBus";
import { avatarUrlForUser } from "../users/avatar/avatarRepository";
import { makeId, nowIso } from "./chatRepositoryModel";
import type { RuntimeScope } from "./runtimeScope";
import { runtimeScopeStorageId } from "./runtimeScope";

export type NotificationEventInput = {
  actorName: string;
  actorUserId?: string | null;
  body: string;
  kind: NotificationKind;
  metadata?: Record<string, string>;
  recipientFacts?: readonly NotificationRecipientInput[];
  recipientUserIds: string[];
  replyTargetId?: string | null;
  replyTargetType?: CommentTargetType | null;
  sourceEventKey?: string | null;
  stream: NotificationStream;
  systemReference?: NotificationSystemReferenceInput | null;
  targetHref: string;
  targetId: string;
  targetType: NotificationTargetType;
  teamId: string;
  title: string;
};

type NotificationEventRow = {
  actor_avatar_object_key: string | null;
  actor_avatar_updated_at: Date | string | null;
  actor_name: string;
  actor_user_id: string | null;
  attention_level: NotificationReceiptAttentionLevel;
  body: string;
  created_at: Date | string;
  delivered_at: Date | string;
  delivery_class: NotificationDeliveryClass;
  id: string;
  kind: NotificationKind;
  metadata: Record<string, string> | null;
  read_at: Date | string | null;
  recipient_reasons: string[] | null;
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

export type NotificationChatDeliveryEvent = {
  actor_name: string;
  actor_user_id: string | null;
  attempts: number;
  attention_level: NotificationReceiptAttentionLevel | null;
  body: string;
  delivery_class: NotificationDeliveryClass | null;
  delivery_id: string;
  delivery_destination_id: string | null;
  delivery_recipient_user_id: string | null;
  delivery_status: NotificationDeliveryStatus;
  event_created_at: Date | string;
  event_id: string;
  kind: NotificationKind;
  metadata: Record<string, string> | null;
  recipient_reasons: string[] | null;
  reply_target_id: string | null;
  reply_target_type: CommentTargetType | null;
  stream: NotificationStream;
  target_href: string;
  target_id: string;
  target_type: NotificationTargetType;
  team_id: string;
  title: string;
};

const SYSTEM_BOT_NAME = "ORF 系统通知";
const DELIVERY_RETRY_BASE_MS = 60_000;
const DELIVERY_RETRY_MAX_MS = 30 * 60_000;

function iso(value: Date | string | null | undefined) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function normalizeSourceEventKey(value: string | null | undefined) {
  return value?.trim() || null;
}

function notificationRecipientReasons(value: readonly unknown[] | null | undefined) {
  return Array.from(new Set(
    (value ?? [])
      .filter((reason): reason is string => typeof reason === "string")
      .map((reason) => reason.trim())
      .filter(Boolean),
  ));
}

function isPgUniqueViolation(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "23505");
}

async function findNotificationEventIdBySourceEventKey(input: { sourceEventKey: string; teamId: string }) {
  const { rows } = await pool.query<{ id: string }>(
    `
      SELECT id
      FROM notification_events
      WHERE team_id = $1
        AND source_event_key = $2
      ORDER BY created_at ASC, id ASC
      LIMIT 1
    `,
    [input.teamId, input.sourceEventKey],
  );
  return rows[0]?.id ?? null;
}

function toNotification(row: NotificationEventRow): AppNotification {
  return {
    id: row.id,
    kind: row.kind,
    recipientUserId: row.recipient_user_id,
    actorUserId: row.actor_user_id,
    actorName: row.actor_name || SYSTEM_BOT_NAME,
    actorAvatarUrl: row.actor_user_id
      ? avatarUrlForUser({
          id: row.actor_user_id,
          avatarObjectKey: row.actor_avatar_object_key,
          avatarUpdatedAt: iso(row.actor_avatar_updated_at),
        })
      : null,
    title: row.title,
    body: row.body,
    deliveryClass: row.delivery_class ?? "ordinary",
    stream: row.stream,
    targetType: row.target_type,
    targetId: row.target_id,
    targetHref: row.target_href,
    recipientReasons: notificationRecipientReasons(row.recipient_reasons),
    replyTargetType: row.reply_target_type,
    replyTargetId: row.reply_target_id,
    readAt: iso(row.read_at),
    attentionLevel: row.attention_level ?? "normal",
    createdAt: iso(row.created_at) ?? nowIso(),
    metadata: row.metadata ?? {},
  };
}

function deliveryErrorText(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 500);
}

function nextDeliveryRetryAt(attempts: number) {
  const delayMs = Math.min(DELIVERY_RETRY_MAX_MS, Math.max(DELIVERY_RETRY_BASE_MS, attempts * DELIVERY_RETRY_BASE_MS));
  return new Date(Date.now() + delayMs).toISOString();
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
    await client.query(
      `
        INSERT INTO notification_events (
          id, team_id, stream, actor_user_id, actor_name, kind, title, body,
          target_type, target_id, target_href, reply_target_type, reply_target_id,
          source_event_key, created_at, metadata
        )
        VALUES ($1, $2, $3::notification_stream, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb)
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
        normalizeSourceEventKey(input.sourceEventKey),
        createdAt,
        JSON.stringify(notificationMetadataWithSystemReference(input.metadata, input.systemReference)),
      ],
    );

    if (recipients.length > 0) {
      const receiptRows = await client.query<NotificationReceiptRow>(
        `
          WITH input_recipients AS (
            SELECT *
            FROM unnest($3::uuid[], $4::timestamptz[], $5::text[], $6::text[], $7::text[]) AS item(user_id, read_at, recipient_reasons, delivery_class, attention_level)
          )
          INSERT INTO notification_receipts (
            event_id, recipient_user_id, read_at, delivered_at,
            recipient_reasons, delivery_class, attention_level
          )
          SELECT
            $1,
            u.id,
            input_recipients.read_at,
            $8,
            input_recipients.recipient_reasons::jsonb,
            input_recipients.delivery_class,
            input_recipients.attention_level
          FROM input_recipients
          INNER JOIN users u ON u.id = input_recipients.user_id
          INNER JOIN team_members tm ON tm.user_id = u.id AND tm.team_id = $2
          WHERE COALESCE(u.status, 'active') = 'active'
            AND ${e2eNotificationRecipientVisibilitySql({
              actorNamePatternParam: "$10",
              actorNameSql: "$9::text",
              recipientEmailSql: "u.email",
              recipientNameSql: "u.name",
              viewerEmailsParam: "$11",
            })}
          ON CONFLICT (event_id, recipient_user_id) DO NOTHING
          RETURNING recipient_user_id::text, read_at, delivered_at
        `,
        [
          eventId,
          input.teamId,
          recipients.map((recipient) => recipient.userId),
          recipients.map((recipient) => recipient.readAt),
          recipients.map((recipient) => JSON.stringify(recipient.reasons)),
          recipients.map((recipient) => recipient.deliveryClass),
          recipients.map((recipient) => recipient.attentionLevel),
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
        actor.avatar_object_key AS actor_avatar_object_key,
        actor.avatar_updated_at AS actor_avatar_updated_at,
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
        r.recipient_reasons,
        r.delivery_class,
        r.attention_level,
        r.read_at,
        r.delivered_at
      FROM notification_events e
      INNER JOIN notification_receipts r ON r.event_id = e.id
      LEFT JOIN users actor ON actor.id = e.actor_user_id
      WHERE e.id = $1
      ORDER BY r.delivered_at DESC, r.recipient_user_id
    `,
    [eventId],
  );
  return rows.map(toNotification);
}

async function listExistingNotificationsForSourceEvent(eventId: string): Promise<AppNotification[]> {
  return listNotificationsForEvent(eventId);
}

export async function createNotificationEvent(input: NotificationEventInput): Promise<AppNotification[]> {
  const createdAt = nowIso();
  const sourceEventKey = normalizeSourceEventKey(input.sourceEventKey);
  if (sourceEventKey) {
    const existingEventId = await findNotificationEventIdBySourceEventKey({
      sourceEventKey,
      teamId: input.teamId,
    });
    if (existingEventId) {
      return listExistingNotificationsForSourceEvent(existingEventId);
    }
  }

  const recipients = resolveNotificationRecipients({
    actorUserId: input.actorUserId,
    createdAt,
    recipientFacts: input.recipientFacts,
    recipientUserIds: input.recipientUserIds,
    stream: input.stream,
  });
  if (input.stream === "personalNotification" && recipients.length === 0) {
    return [];
  }

  const eventId = makeId("nevt");
  try {
    await insertNotificationEvent({ ...input, sourceEventKey }, eventId, createdAt, recipients);
  } catch (error) {
    if (sourceEventKey && isPgUniqueViolation(error)) {
      const existingEventId = await findNotificationEventIdBySourceEventKey({
        sourceEventKey,
        teamId: input.teamId,
      });
      if (existingEventId) {
        return listExistingNotificationsForSourceEvent(existingEventId);
      }
    }
    throw error;
  }
  const notifications = await listNotificationsForEvent(eventId);
  for (const notification of notifications) {
    publishRealtimeNotification(input.teamId, notification);
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
        actor.avatar_object_key AS actor_avatar_object_key,
        actor.avatar_updated_at AS actor_avatar_updated_at,
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
        r.recipient_reasons,
        r.delivery_class,
        r.attention_level,
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
        AND e.id = $3
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
        actor.avatar_object_key AS actor_avatar_object_key,
        actor.avatar_updated_at AS actor_avatar_updated_at,
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
        r.recipient_reasons,
        r.delivery_class,
        r.attention_level,
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

export async function listNotificationChatDeliveryIdsForEvent(eventId: string) {
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
  return rows.map((row) => row.id);
}

export async function listPendingNotificationChatDeliveryIds(limit = 50) {
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
  return rows.map((row) => row.id);
}

export async function loadNotificationChatDelivery(deliveryId: string): Promise<NotificationChatDeliveryEvent | null> {
  const { rows } = await pool.query<NotificationChatDeliveryEvent>(
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
        e.metadata,
        r.recipient_reasons,
        r.delivery_class,
        r.attention_level
      FROM notification_deliveries d
      INNER JOIN notification_events e ON e.id = d.event_id
      LEFT JOIN notification_receipts r ON r.event_id = e.id
        AND d.recipient_user_id IS NOT NULL
        AND r.recipient_user_id = d.recipient_user_id
      WHERE d.id = $1
        AND d.channel = 'chat'
      LIMIT 1
    `,
    [deliveryId],
  );
  return rows[0] ?? null;
}

export async function markNotificationChatDeliveryDelivered(input: {
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

export async function markNotificationChatDeliveryFailed(input: { attempts: number; deliveryId: string; error: unknown }) {
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

export async function markNotificationReceiptsReadByEventIds(
  client: PoolClient,
  input: { eventIds: readonly string[]; readAt: string; teamId: string; userId: string },
) {
  const eventIds = Array.from(new Set(input.eventIds.map((id) => id.trim()).filter(Boolean)));
  if (eventIds.length === 0) return 0;
  const { rows } = await client.query<{ count: number }>(
    `
      WITH updated AS (
        UPDATE notification_receipts r
        SET read_at = $4
        FROM notification_events e
        WHERE e.id = r.event_id
          AND e.team_id = $1
          AND r.recipient_user_id = $2
          AND r.event_id = ANY($3::text[])
          AND r.read_at IS NULL
        RETURNING r.event_id
      )
      SELECT count(*)::int AS count
    `,
    [input.teamId, input.userId, eventIds, input.readAt],
  );
  return Number(rows[0]?.count ?? 0);
}

export async function markNotificationReceiptsUnreadByEventIds(
  client: PoolClient,
  input: { eventIds: readonly string[]; teamId: string; userId: string },
) {
  const eventIds = Array.from(new Set(input.eventIds.map((id) => id.trim()).filter(Boolean)));
  if (eventIds.length === 0) return 0;
  const { rows } = await client.query<{ count: number }>(
    `
      WITH updated AS (
        UPDATE notification_receipts r
        SET read_at = NULL
        FROM notification_events e
        WHERE e.id = r.event_id
          AND e.team_id = $1
          AND r.recipient_user_id = $2
          AND r.event_id = ANY($3::text[])
          AND r.read_at IS NOT NULL
        RETURNING r.event_id
      )
      SELECT count(*)::int AS count
    `,
    [input.teamId, input.userId, eventIds],
  );
  return Number(rows[0]?.count ?? 0);
}
