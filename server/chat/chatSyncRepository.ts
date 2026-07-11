import { createHash } from "node:crypto";
import {
  CHAT_SYNC_MAX_INCREMENTAL_EVENTS,
  CHAT_SYNC_PROTOCOL_VERSION,
  chatSyncEventTypes,
  type ChatSyncEvent,
  type ChatSyncEventType,
  type ChatSyncFallbackReason,
  type ChatSyncResponse,
} from "../../src/domain/chatSync";
import {
  E2E_NOTIFICATION_ACTOR_NAME_SQL_PATTERN,
  normalizedE2eNotificationViewerEmails,
  visibleSystemNotificationMessageSql,
} from "../notifications/notificationIsolationPolicy";
import { pool } from "../db/client";
import { storageTeamId, type ChatActor } from "../repositories/chatRepositoryModel";
import { isPrivateChatSyncEvent, sanitizeChatSyncMetadata } from "./chatSyncEventModel";

type RawChatSyncEventRow = {
  actor_user_id: string | null;
  channel_id: string;
  event_type: string;
  metadata_json: unknown;
  object_id: string;
  object_type: string;
  occurred_at: Date | string;
  seq: string;
};

type ChatSyncBounds = {
  latest_seq: string | null;
  oldest_seq: string | null;
};

const eventTypeSet = new Set<string>(chatSyncEventTypes);

function chatSyncPermissionFingerprint(actor: ChatActor) {
  return createHash("sha256").update(JSON.stringify({
    canCreatePrivateChannel: actor.canCreatePrivateChannel,
    canCreatePublicChannel: actor.canCreatePublicChannel,
    canManageAnyChannel: actor.canManageAnyChannel,
    canManageAnyMembers: actor.canManageAnyMembers,
    canRead: actor.canRead,
    canWrite: actor.canWrite,
    role: actor.role,
    teamId: storageTeamId(actor),
  })).digest("hex");
}

function fullResponse(
  teamId: string,
  nextCursor: string,
  permissionFingerprint: string,
  reason: ChatSyncFallbackReason,
): ChatSyncResponse {
  return {
    events: [],
    fallbackReason: reason,
    hasMore: false,
    mode: "full",
    nextCursor,
    permissionFingerprint,
    protocolVersion: CHAT_SYNC_PROTOCOL_VERSION,
    teamId,
  };
}

function asEventType(value: string): ChatSyncEventType | null {
  return eventTypeSet.has(value) ? value as ChatSyncEventType : null;
}

function toIso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : value;
}

async function visibleEventSequences(actor: ChatActor, rows: RawChatSyncEventRow[]) {
  if (rows.length === 0) return new Set<string>();
  const teamId = storageTeamId(actor);
  const messageVisibilitySql = visibleSystemNotificationMessageSql({
    actorNamePatternParam: "$5",
    messageSql: "message_fact",
    recipientUserIdParam: "$2",
    viewerEmailsParam: "$6",
  });
  const { rows: visibleRows } = await pool.query<{ seq: string }>(
    `
      SELECT event.seq::text AS seq
      FROM chat_sync_events event
      INNER JOIN chat_channel_members membership
        ON membership.channel_id = event.channel_id
       AND membership.user_id = $2
      LEFT JOIN chat_messages message_fact
        ON message_fact.id = event.object_id
       AND event.object_type IN ('message', 'thread')
      WHERE event.team_id = $1
        AND event.seq = ANY($3::bigint[])
        AND (
          NOT (event.event_type = ANY($4::text[]))
          OR event.actor_user_id = $2
        )
        AND (
          event.object_type NOT IN ('message', 'thread')
          OR (
            message_fact.id IS NOT NULL
            AND message_fact.team_id = event.team_id
            AND message_fact.channel_id = event.channel_id
            AND ${messageVisibilitySql}
          )
        )
    `,
    [
      teamId,
      actor.id,
      rows.map((row) => row.seq),
      chatSyncEventTypes.filter(isPrivateChatSyncEvent),
      E2E_NOTIFICATION_ACTOR_NAME_SQL_PATTERN,
      normalizedE2eNotificationViewerEmails(),
    ],
  );
  return new Set(visibleRows.map((row) => row.seq));
}

export async function getChatSync(input: {
  actor: ChatActor;
  cursor?: string;
  limit: number;
  permissionFingerprint?: string;
  protocolVersion?: number;
}): Promise<ChatSyncResponse> {
  const teamId = storageTeamId(input.actor);
  const permissionFingerprint = chatSyncPermissionFingerprint(input.actor);
  const { rows: boundsRows } = await pool.query<ChatSyncBounds>(
    `
      SELECT
        max(seq)::text AS latest_seq,
        min(seq)::text AS oldest_seq
      FROM chat_sync_events
      WHERE team_id = $1
    `,
    [teamId],
  );
  const bounds = boundsRows[0] ?? { latest_seq: null, oldest_seq: null };
  const latestCursor = bounds.latest_seq ?? input.cursor ?? "0";

  if (input.protocolVersion !== undefined && input.protocolVersion !== CHAT_SYNC_PROTOCOL_VERSION) {
    return fullResponse(teamId, latestCursor, permissionFingerprint, "protocol_mismatch");
  }
  if (input.cursor === undefined) return fullResponse(teamId, latestCursor, permissionFingerprint, "cursor_missing");
  if (input.permissionFingerprint !== permissionFingerprint) {
    return fullResponse(teamId, latestCursor, permissionFingerprint, "permission_changed");
  }
  if (bounds.latest_seq && BigInt(input.cursor) > BigInt(bounds.latest_seq)) {
    return fullResponse(teamId, bounds.latest_seq, permissionFingerprint, "cursor_gap");
  }
  if (bounds.oldest_seq && BigInt(input.cursor) < BigInt(bounds.oldest_seq)) {
    return fullResponse(teamId, bounds.latest_seq ?? latestCursor, permissionFingerprint, "cursor_expired");
  }

  const { rows: windowRows } = await pool.query<{ seq: string }>(
    `
      SELECT seq::text AS seq
      FROM chat_sync_events
      WHERE team_id = $1 AND seq > $2::bigint
      ORDER BY seq ASC
      LIMIT $3
    `,
    [teamId, input.cursor, CHAT_SYNC_MAX_INCREMENTAL_EVENTS + 1],
  );
  if (windowRows.length > CHAT_SYNC_MAX_INCREMENTAL_EVENTS) {
    return fullResponse(teamId, bounds.latest_seq ?? latestCursor, permissionFingerprint, "event_window_too_large");
  }

  const { rows } = await pool.query<RawChatSyncEventRow>(
    `
      SELECT
        seq::text AS seq,
        event_type,
        object_type,
        object_id,
        channel_id,
        actor_user_id,
        occurred_at,
        metadata_json
      FROM chat_sync_events
      WHERE team_id = $1 AND seq > $2::bigint
      ORDER BY seq ASC
      LIMIT $3
    `,
    [teamId, input.cursor, input.limit + 1],
  );
  const hasMore = rows.length > input.limit;
  const pageRows = hasMore ? rows.slice(0, input.limit) : rows;
  const nextCursor = pageRows.at(-1)?.seq ?? input.cursor;

  const actorMembershipChanged = pageRows.some((row) =>
    row.event_type === "channel.member.changed" && row.object_id === input.actor.id,
  );
  if (actorMembershipChanged) {
    return fullResponse(teamId, bounds.latest_seq ?? nextCursor, permissionFingerprint, "permission_changed");
  }

  const visibleSequences = await visibleEventSequences(input.actor, pageRows);
  const events: ChatSyncEvent[] = [];
  for (const row of pageRows) {
    if (!visibleSequences.has(row.seq)) continue;
    const eventType = asEventType(row.event_type);
    if (!eventType) continue;
    if (!(["channel", "message", "thread", "user"] as const).includes(row.object_type as never)) continue;
    events.push({
      actorUserId: row.actor_user_id,
      channelId: row.channel_id,
      eventType,
      metadata: sanitizeChatSyncMetadata(eventType, row.metadata_json),
      objectId: row.object_id,
      objectType: row.object_type as ChatSyncEvent["objectType"],
      occurredAt: toIso(row.occurred_at),
      seq: row.seq,
    });
  }

  return {
    events,
    fallbackReason: null,
    hasMore,
    mode: "incremental",
    nextCursor,
    permissionFingerprint,
    protocolVersion: CHAT_SYNC_PROTOCOL_VERSION,
    teamId,
  };
}

export async function pruneChatSyncEvents(input: { maxEventsPerTeam: number; retentionDays: number }) {
  const expired = await pool.query(
    `DELETE FROM chat_sync_events WHERE occurred_at < now() - ($1::text || ' days')::interval`,
    [input.retentionDays],
  );
  const overflow = await pool.query(
    `
      WITH team_cutoffs AS (
        SELECT team.team_id,
               (
                 SELECT candidate.seq
                 FROM chat_sync_events candidate
                 WHERE candidate.team_id = team.team_id
                 ORDER BY candidate.seq DESC
                 OFFSET $1 LIMIT 1
               ) AS delete_through_seq
        FROM (SELECT DISTINCT team_id FROM chat_sync_events) team
      )
      DELETE FROM chat_sync_events event
      USING team_cutoffs cutoff
      WHERE event.team_id = cutoff.team_id
        AND cutoff.delete_through_seq IS NOT NULL
        AND event.seq <= cutoff.delete_through_seq
    `,
    [input.maxEventsPerTeam],
  );
  return { expired: expired.rowCount ?? 0, overflow: overflow.rowCount ?? 0 };
}
