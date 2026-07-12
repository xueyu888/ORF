import type { PoolClient } from "pg";
import { pool } from "../db/client";
import {
  CHAT_PUSH_DELIVERY_LEASE_MS,
  CHAT_PUSH_DELIVERY_MAX_ATTEMPTS,
  chatPushDeliveryFailureCounts,
  decideChatPushDeliveryFailure,
  type ChatPushDeliveryClaim,
  type ChatPushDeliveryResult,
} from "./chatPushDeliveryModel";

type PushDeliveryRow = {
  attempts: number;
  channel_id: string;
  id: string;
  message_id: string;
  recipient_user_id: string;
  team_id: string;
};

export type { ChatPushDeliveryClaim } from "./chatPushDeliveryModel";

function deliveryErrorText(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 2_000) : String(error).slice(0, 2_000);
}

export async function enqueueChatPushDeliveries(
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
      INSERT INTO chat_push_deliveries (
        id, message_id, team_id, channel_id, recipient_user_id,
        status, attempts, target_count, success_count, failure_count, created_at, updated_at
      )
      SELECT
        'chat-push-' || $1 || '-' || members.user_id::text,
        $1, $2, $3, members.user_id,
        'pending', 0, 0, 0, 0, $6, $6
      FROM chat_channel_members members
      INNER JOIN users recipients
        ON recipients.id = members.user_id
       AND COALESCE(recipients.status, 'active') = 'active'
      WHERE members.channel_id = $3
        AND members.user_id <> $4::uuid
        AND members.muted = false
        AND ($5::text IS NULL OR members.user_id::text <> $5::text)
      ON CONFLICT (message_id, recipient_user_id) DO NOTHING
    `,
    [input.messageId, input.teamId, input.channelId, input.authorUserId, input.systemActorUserId ?? null, input.createdAt],
  );
}

export async function claimChatPushDeliveries(limit: number) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `
        UPDATE chat_push_deliveries
        SET status = 'dead_letter', outcome = 'failed',
            last_error = COALESCE(last_error, 'Push lease expired after the final attempt before its result was persisted.'),
            next_attempt_at = NULL, lease_expires_at = NULL,
            completed_at = now(), updated_at = now()
        WHERE status = 'processing'
          AND lease_expires_at <= now()
          AND attempts >= $1
      `,
      [CHAT_PUSH_DELIVERY_MAX_ATTEMPTS],
    );
    const { rows } = await client.query<PushDeliveryRow>(
      `
        WITH candidates AS (
          SELECT id
          FROM chat_push_deliveries
          WHERE status = 'pending'
             OR (status = 'retry_scheduled' AND next_attempt_at <= now())
             OR (status = 'processing' AND lease_expires_at <= now() AND attempts < $3)
          ORDER BY created_at ASC
          FOR UPDATE SKIP LOCKED
          LIMIT $1
        )
        UPDATE chat_push_deliveries deliveries
        SET status = 'processing', outcome = NULL, attempts = deliveries.attempts + 1,
            target_count = 0, success_count = 0, failure_count = 0,
            last_error = NULL, next_attempt_at = NULL, completed_at = NULL,
            lease_expires_at = now() + ($2::double precision * interval '1 second'),
            updated_at = now()
        FROM candidates
        WHERE deliveries.id = candidates.id
        RETURNING deliveries.id, deliveries.message_id, deliveries.team_id,
                  deliveries.channel_id, deliveries.recipient_user_id, deliveries.attempts
      `,
      [Math.max(1, Math.floor(limit)), CHAT_PUSH_DELIVERY_LEASE_MS / 1_000, CHAT_PUSH_DELIVERY_MAX_ATTEMPTS],
    );
    await client.query("COMMIT");
    return rows.map((row): ChatPushDeliveryClaim => ({
      attempts: row.attempts,
      channelId: row.channel_id,
      id: row.id,
      messageId: row.message_id,
      recipientUserId: row.recipient_user_id,
      teamId: row.team_id,
    }));
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function completeChatPushDelivery(
  claim: Pick<ChatPushDeliveryClaim, "attempts" | "id">,
  result: ChatPushDeliveryResult,
) {
  const update = await pool.query(
    `
      UPDATE chat_push_deliveries
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

export async function failChatPushDelivery(claim: ChatPushDeliveryClaim, error: unknown) {
  const decision = decideChatPushDeliveryFailure(claim);
  const counts = chatPushDeliveryFailureCounts(error);
  const update = await pool.query(
    `
      UPDATE chat_push_deliveries
      SET status = $2, outcome = $3, last_error = $4,
          next_attempt_at = $5, lease_expires_at = NULL,
          completed_at = $6, target_count = $7, success_count = $8,
          failure_count = $9, updated_at = now()
      WHERE id = $1 AND status = 'processing' AND attempts = $10
    `,
    [claim.id, decision.status, decision.outcome, deliveryErrorText(error), decision.nextAttemptAt,
      decision.completedAt, counts.targetCount, counts.successCount, counts.failureCount, claim.attempts],
  );
  return { ...decision, persisted: update.rowCount === 1 };
}

export async function oldestPendingChatPushDeliveryAgeMs() {
  const { rows } = await pool.query<{ age_ms: string | null }>(
    `
      SELECT extract(epoch FROM (now() - min(created_at))) * 1000 AS age_ms
      FROM chat_push_deliveries
      WHERE status IN ('pending', 'processing', 'retry_scheduled')
    `,
  );
  const value = Number(rows[0]?.age_ms ?? 0);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}
