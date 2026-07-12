import type { PoolClient } from "pg";
import { pool } from "../db/client";
import {
  CHAT_MESSAGE_DELIVERY_BATCH_SIZE,
  chatMessageDeliveryFailureCounts,
  chatMessageDeliveryLeaseMs,
  chatMessageDeliveryMaxAttempts,
  decideChatMessageDeliveryFailure,
  type ChatMessageDeliveryClaim,
  type ChatMessageDeliveryResult,
  type ChatMessageDeliveryTransport,
} from "./chatMessageDeliveryModel";

type DeliveryRow = {
  attempts: number;
  channel_id: string;
  id: string;
  message_id: string;
  recipient_user_id: string;
  team_id: string;
  transport: ChatMessageDeliveryTransport;
};

export type { ChatMessageDeliveryClaim } from "./chatMessageDeliveryModel";

function deliveryErrorText(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 2_000) : String(error).slice(0, 2_000);
}

export async function enqueueChatMessageDeliveries(
  client: PoolClient,
  input: {
    authorUserId: string;
    channelId: string;
    createdAt: string;
    messageId: string;
    systemActorUserId?: string | null;
    teamId: string;
  },
) {
  await client.query(
    `
      INSERT INTO chat_message_deliveries (
        id, message_id, team_id, channel_id, recipient_user_id, transport,
        status, attempts, target_count, success_count, failure_count, created_at, updated_at
      )
      SELECT
        'chat-delivery-' || $1 || '-' || members.user_id::text || '-' || transports.transport,
        $1, $2, $3, members.user_id, transports.transport,
        'pending', 0, 0, 0, 0, $6, $6
      FROM chat_channel_members members
      INNER JOIN users recipients
        ON recipients.id = members.user_id
       AND COALESCE(recipients.status, 'active') = 'active'
      CROSS JOIN LATERAL (
        SELECT 'realtime'::text AS transport
        UNION ALL
        SELECT 'push'::text
        WHERE members.user_id <> $4::uuid
          AND members.muted = false
          AND ($5::text IS NULL OR members.user_id::text <> $5::text)
      ) transports
      WHERE members.channel_id = $3
      ON CONFLICT (message_id, recipient_user_id, transport) DO NOTHING
    `,
    [input.messageId, input.teamId, input.channelId, input.authorUserId, input.systemActorUserId ?? null, input.createdAt],
  );
}

export async function claimChatMessageDeliveries(limit = CHAT_MESSAGE_DELIVERY_BATCH_SIZE) {
  const realtimeLeaseSeconds = chatMessageDeliveryLeaseMs("realtime") / 1_000;
  const pushLeaseSeconds = chatMessageDeliveryLeaseMs("push") / 1_000;
  const realtimeMaxAttempts = chatMessageDeliveryMaxAttempts("realtime");
  const pushMaxAttempts = chatMessageDeliveryMaxAttempts("push");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `
        UPDATE chat_message_deliveries
        SET status = 'dead_letter', outcome = 'failed',
            last_error = COALESCE(last_error, 'Delivery lease expired after the final attempt before its result was persisted.'),
            next_attempt_at = NULL, lease_expires_at = NULL,
            completed_at = now(), updated_at = now()
        WHERE status = 'processing'
          AND lease_expires_at <= now()
          AND attempts >= CASE transport WHEN 'realtime' THEN $1::integer ELSE $2::integer END
      `,
      [realtimeMaxAttempts, pushMaxAttempts],
    );
    const { rows } = await client.query<DeliveryRow>(
      `
        WITH candidates AS (
          SELECT id
          FROM chat_message_deliveries
          WHERE (
            status = 'pending'
            OR (status = 'retry_scheduled' AND next_attempt_at <= now())
            OR (
              status = 'processing'
              AND lease_expires_at <= now()
              AND attempts < CASE transport WHEN 'realtime' THEN $4::integer ELSE $5::integer END
            )
          )
          ORDER BY created_at ASC
          FOR UPDATE SKIP LOCKED
          LIMIT $1
        )
        UPDATE chat_message_deliveries deliveries
        SET status = 'processing',
            outcome = NULL,
            attempts = deliveries.attempts + 1,
            target_count = 0,
            success_count = 0,
            failure_count = 0,
            last_error = NULL,
            next_attempt_at = NULL,
            completed_at = NULL,
            lease_expires_at = now() + (
              CASE deliveries.transport
                WHEN 'realtime' THEN $2::double precision
                ELSE $3::double precision
              END * interval '1 second'
            ),
            updated_at = now()
        FROM candidates
        WHERE deliveries.id = candidates.id
        RETURNING deliveries.id, deliveries.message_id, deliveries.team_id,
                  deliveries.channel_id, deliveries.recipient_user_id,
                  deliveries.transport, deliveries.attempts
      `,
      [Math.max(1, Math.floor(limit)), realtimeLeaseSeconds, pushLeaseSeconds, realtimeMaxAttempts, pushMaxAttempts],
    );
    await client.query("COMMIT");
    return rows.map((row): ChatMessageDeliveryClaim => ({
      attempts: row.attempts,
      channelId: row.channel_id,
      id: row.id,
      messageId: row.message_id,
      recipientUserId: row.recipient_user_id,
      teamId: row.team_id,
      transport: row.transport,
    }));
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function completeChatMessageDelivery(
  claim: Pick<ChatMessageDeliveryClaim, "attempts" | "id">,
  result: ChatMessageDeliveryResult,
) {
  const update = await pool.query(
    `
      UPDATE chat_message_deliveries
      SET status = 'completed', outcome = $2,
          target_count = $3, success_count = $4, failure_count = $5,
          last_error = NULL, next_attempt_at = NULL, lease_expires_at = NULL,
          completed_at = now(), updated_at = now()
      WHERE id = $1 AND status = 'processing' AND attempts = $6
    `,
    [claim.id, result.outcome, result.targetCount, result.successCount, result.failureCount, claim.attempts],
  );
  return update.rowCount === 1;
}

export async function failChatMessageDelivery(claim: ChatMessageDeliveryClaim, error: unknown) {
  const decision = decideChatMessageDeliveryFailure(claim);
  const counts = chatMessageDeliveryFailureCounts(error);
  const update = await pool.query(
    `
      UPDATE chat_message_deliveries
      SET status = $2, outcome = $3, last_error = $4,
          next_attempt_at = $5, lease_expires_at = NULL,
          completed_at = $6, target_count = $7, success_count = $8,
          failure_count = $9, updated_at = now()
      WHERE id = $1 AND status = 'processing' AND attempts = $10
    `,
    [
      claim.id,
      decision.status,
      decision.outcome,
      deliveryErrorText(error),
      decision.nextAttemptAt,
      decision.completedAt,
      counts.targetCount,
      counts.successCount,
      counts.failureCount,
      claim.attempts,
    ],
  );
  return { ...decision, persisted: update.rowCount === 1 };
}

export async function oldestPendingChatMessageDeliveryAgeMs() {
  const { rows } = await pool.query<{ age_ms: string | null }>(
    `
      SELECT extract(epoch FROM (now() - min(created_at))) * 1000 AS age_ms
      FROM chat_message_deliveries
      WHERE status IN ('pending', 'processing', 'retry_scheduled')
    `,
  );
  const value = Number(rows[0]?.age_ms ?? 0);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}
