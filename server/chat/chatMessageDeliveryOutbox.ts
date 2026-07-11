import type { PoolClient } from "pg";
import { pool } from "../db/client";

export type ChatMessageDeliveryTransport = "realtime" | "push";

export type ChatMessageDeliveryClaim = {
  id: string;
  messageId: string;
  teamId: string;
  channelId: string;
  recipientUserId: string;
  transport: ChatMessageDeliveryTransport;
  attempts: number;
};

type DeliveryRow = {
  id: string;
  message_id: string;
  team_id: string;
  channel_id: string;
  recipient_user_id: string;
  transport: ChatMessageDeliveryTransport;
  attempts: number;
};

const RETRY_BASE_MS = 5_000;
const RETRY_MAX_MS = 30 * 60_000;
const DELIVERY_LEASE_MS = 5 * 60_000;
const DELIVERY_CONCURRENCY = 8;

function retryDelayMs(attempts: number) {
  return Math.min(RETRY_MAX_MS, RETRY_BASE_MS * (2 ** Math.max(0, attempts - 1)));
}

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
        status, attempts, created_at, updated_at
      )
      SELECT
        'chat-delivery-' || $1 || '-' || members.user_id::text || '-' || transports.transport,
        $1, $2, $3, members.user_id, transports.transport,
        'pending', 0, $6, $6
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

async function claimChatMessageDeliveries(input: { limit: number; messageId?: string }) {
  const leaseExpiresAt = new Date(Date.now() + DELIVERY_LEASE_MS).toISOString();
  const { rows } = await pool.query<DeliveryRow>(
    `
      WITH candidates AS (
        SELECT id
        FROM chat_message_deliveries
        WHERE ($2::text IS NULL OR message_id = $2)
          AND (
            (status IN ('pending', 'failed') AND (next_attempt_at IS NULL OR next_attempt_at <= now()))
            OR (status = 'processing' AND lease_expires_at <= now())
          )
        ORDER BY created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT $1
      )
      UPDATE chat_message_deliveries deliveries
      SET status = 'processing',
          attempts = deliveries.attempts + 1,
          lease_expires_at = $3,
          updated_at = now()
      FROM candidates
      WHERE deliveries.id = candidates.id
      RETURNING deliveries.id, deliveries.message_id, deliveries.team_id,
                deliveries.channel_id, deliveries.recipient_user_id,
                deliveries.transport, deliveries.attempts
    `,
    [Math.max(1, input.limit), input.messageId ?? null, leaseExpiresAt],
  );
  return rows.map((row): ChatMessageDeliveryClaim => ({
    id: row.id,
    messageId: row.message_id,
    teamId: row.team_id,
    channelId: row.channel_id,
    recipientUserId: row.recipient_user_id,
    transport: row.transport,
    attempts: row.attempts,
  }));
}

async function markDelivered(id: string) {
  await pool.query(
    `UPDATE chat_message_deliveries
     SET status = 'delivered', last_error = NULL, next_attempt_at = NULL,
         lease_expires_at = NULL, delivered_at = now(), updated_at = now()
     WHERE id = $1`,
    [id],
  );
}

async function markFailed(claim: ChatMessageDeliveryClaim, error: unknown) {
  const nextAttemptAt = new Date(Date.now() + retryDelayMs(claim.attempts)).toISOString();
  await pool.query(
    `UPDATE chat_message_deliveries
     SET status = 'failed', last_error = $2, next_attempt_at = $3,
         lease_expires_at = NULL, updated_at = now()
     WHERE id = $1`,
    [claim.id, deliveryErrorText(error), nextAttemptAt],
  );
}

export async function flushChatMessageDeliveries(input: {
  deliver: (claim: ChatMessageDeliveryClaim) => Promise<void>;
  limit?: number;
  messageId?: string;
  onError?: (error: unknown, claim: ChatMessageDeliveryClaim) => void;
}) {
  const claims = await claimChatMessageDeliveries({ limit: input.limit ?? 100, messageId: input.messageId });
  let delivered = 0;
  let failed = 0;
  for (let index = 0; index < claims.length; index += DELIVERY_CONCURRENCY) {
    await Promise.all(claims.slice(index, index + DELIVERY_CONCURRENCY).map(async (claim) => {
      try {
        await input.deliver(claim);
        await markDelivered(claim.id);
        delivered += 1;
      } catch (error) {
        await markFailed(claim, error);
        failed += 1;
        input.onError?.(error, claim);
      }
    }));
  }
  return { attempted: claims.length, delivered, failed };
}
