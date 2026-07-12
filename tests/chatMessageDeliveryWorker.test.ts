import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  ChatMessageDeliveryAttemptError,
  chatMessageDeliveryFailureCounts,
  chatMessageDeliveryMaxAttempts,
  decideChatMessageDeliveryFailure,
  normalizeChatMessageDeliveryResult,
  type ChatMessageDeliveryClaim,
} from "../server/chat/chatMessageDeliveryModel";
import { createChatMessageDeliveryWorker } from "../server/chat/chatMessageDeliveryWorker";
import { validateChatMessageDeliverySchema } from "../server/db/schemaGuard";
import { publishRealtimeEventToUser, subscribeRealtimeEvents } from "../server/realtime/realtimeEventBus";

function claim(id: string, overrides: Partial<ChatMessageDeliveryClaim> = {}): ChatMessageDeliveryClaim {
  return {
    attempts: 1,
    channelId: "channel-1",
    id,
    messageId: `message-${id}`,
    recipientUserId: "00000000-0000-4000-8000-000000000001",
    teamId: "team-1",
    transport: "realtime",
    ...overrides,
  };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

test("delivery failures retry only up to the transport-specific finite limit", () => {
  assert.equal(chatMessageDeliveryMaxAttempts("realtime"), 8);
  assert.equal(chatMessageDeliveryMaxAttempts("push"), 12);

  const realtimeRetry = decideChatMessageDeliveryFailure({ attempts: 7, transport: "realtime" }, new Date(0));
  assert.equal(realtimeRetry.status, "retry_scheduled");
  assert.equal(realtimeRetry.outcome, null);
  assert.ok(realtimeRetry.nextAttemptAt);

  const realtimeDeadLetter = decideChatMessageDeliveryFailure({ attempts: 8, transport: "realtime" }, new Date(0));
  assert.equal(realtimeDeadLetter.status, "dead_letter");
  assert.equal(realtimeDeadLetter.outcome, "failed");
  assert.equal(realtimeDeadLetter.nextAttemptAt, null);

  const pushRetry = decideChatMessageDeliveryFailure({ attempts: 11, transport: "push" }, new Date(0));
  assert.equal(pushRetry.status, "retry_scheduled");
  assert.equal(decideChatMessageDeliveryFailure({ attempts: 12, transport: "push" }, new Date(0)).status, "dead_letter");

  assert.deepEqual(chatMessageDeliveryFailureCounts(new ChatMessageDeliveryAttemptError("failed", {
    failureCount: 2,
    successCount: 0,
    targetCount: 2,
  })), { failureCount: 2, successCount: 0, targetCount: 2 });
});

test("delivery result counters are normalized into one internally valid transport outcome", () => {
  assert.deepEqual(normalizeChatMessageDeliveryResult({
    failureCount: 9,
    outcome: "push_partially_accepted",
    successCount: 3,
    targetCount: 4,
  }), {
    failureCount: 1,
    outcome: "push_partially_accepted",
    successCount: 3,
    targetCount: 4,
  });
  assert.throws(() => normalizeChatMessageDeliveryResult({
    failureCount: 0,
    outcome: "sent_to_connection",
    successCount: 0,
    targetCount: 0,
  }), /Invalid sent_to_connection/);
});

test("one worker globally caps active delivery work and drains a full batch", async () => {
  const claims = Array.from({ length: 12 }, (_, index) => claim(String(index)));
  let claimCalls = 0;
  let active = 0;
  let maximumActive = 0;
  const completed: string[] = [];
  const firstBatch = deferred();

  const worker = createChatMessageDeliveryWorker({
    claim: async () => {
      claimCalls += 1;
      return claimCalls === 1 ? claims : [];
    },
    complete: async (item) => {
      completed.push(item.id);
      return true;
    },
    deliver: async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active -= 1;
      return { failureCount: 0, outcome: "sent_to_connection", successCount: 1, targetCount: 1 };
    },
    fail: async () => ({ persisted: true, status: "retry_scheduled" }),
    onBatch: (result) => {
      if (result.attempted === claims.length) firstBatch.resolve();
    },
  }, { batchSize: claims.length, concurrency: 3 });

  worker.request();
  await firstBatch.promise;
  await worker.stop();

  assert.equal(maximumActive, 3);
  assert.deepEqual(new Set(completed), new Set(claims.map((item) => item.id)));
  assert.ok(claimCalls >= 1);
});

test("wakeups received during a running batch are coalesced into one trailing claim", async () => {
  const started = deferred();
  const release = deferred();
  const finished = deferred();
  let claimCalls = 0;
  const processed: string[] = [];
  const batches = [[claim("first")], [claim("second")], []];

  const worker = createChatMessageDeliveryWorker({
    claim: async () => batches[claimCalls++] ?? [],
    complete: async (item) => {
      processed.push(item.id);
      if (processed.length === 2) finished.resolve();
      return true;
    },
    deliver: async (item) => {
      if (item.id === "first") {
        started.resolve();
        await release.promise;
      }
      return { failureCount: 0, outcome: "no_online_subscriber", successCount: 0, targetCount: 0 };
    },
    fail: async () => ({ persisted: true, status: "retry_scheduled" }),
  }, { batchSize: 10, concurrency: 1 });

  worker.request();
  await started.promise;
  worker.request();
  worker.request();
  worker.request();
  release.resolve();
  await finished.promise;
  await worker.stop();

  assert.deepEqual(processed, ["first", "second"]);
  assert.equal(claimCalls, 2);
});

test("realtime transport counts only currently writable SSE connections as successful", () => {
  const teamId = "delivery-result-team";
  const userId = "delivery-result-user";
  const unsubscribeWritable = subscribeRealtimeEvents({
    id: "writable",
    teamId,
    userId,
    send: () => true,
  });
  const unsubscribeClosed = subscribeRealtimeEvents({
    id: "closed",
    teamId,
    userId,
    send: () => false,
  });

  try {
    const result = publishRealtimeEventToUser(teamId, userId, {
      createdAt: "2026-07-11T00:00:00.000Z",
      id: "delivery-result-event",
      kind: "orf.read-model.invalidated",
      invalidation: {
        actorUserId: null,
        createdAt: "2026-07-11T00:00:00.000Z",
        id: "delivery-result-invalidation",
        models: ["chat"],
        reason: "chat.message.created",
        target: { id: "message-1", type: "chatMessage" },
      },
    });
    assert.deepEqual(result, { failureCount: 1, successCount: 1, targetCount: 2 });
    assert.deepEqual(
      publishRealtimeEventToUser(teamId, userId, {
        createdAt: "2026-07-11T00:00:01.000Z",
        id: "delivery-result-event-2",
        kind: "orf.read-model.invalidated",
        invalidation: {
          actorUserId: null,
          createdAt: "2026-07-11T00:00:01.000Z",
          id: "delivery-result-invalidation-2",
          models: ["chat"],
          reason: "chat.message.created",
          target: { id: "message-2", type: "chatMessage" },
        },
      }),
      { failureCount: 0, successCount: 1, targetCount: 1 },
    );
  } finally {
    unsubscribeWritable();
    unsubscribeClosed();
  }
});

test("runtime schema guard requires truthful outcomes and rejects the legacy delivered shape", () => {
  const required = [
    "id", "message_id", "team_id", "channel_id", "recipient_user_id", "transport", "status", "attempts",
    "target_count", "success_count", "failure_count", "created_at", "updated_at",
  ];
  const nullable = ["outcome", "last_error", "next_attempt_at", "lease_expires_at", "completed_at"];
  const constraints = [
    {
      constraintName: "chat_message_deliveries_status_check",
      definition: "CHECK (status IN ('pending', 'processing', 'retry_scheduled', 'completed', 'dead_letter'))",
    },
    {
      constraintName: "chat_message_deliveries_outcome_check",
      definition: "CHECK (outcome IN ('legacy_processed', 'sent_to_connection', 'no_online_subscriber', 'push_accepted', 'push_partially_accepted', 'push_rejected', 'no_push_device', 'push_disabled', 'not_applicable', 'failed'))",
    },
    { constraintName: "chat_message_deliveries_counts_check", definition: "CHECK (target_count >= 0)" },
    { constraintName: "chat_message_deliveries_state_shape_check", definition: "CHECK (status IS NOT NULL)" },
  ];
  const columns = [
    ...required.map((columnName) => ({ columnName, isNullable: "NO", tableName: "chat_message_deliveries" })),
    ...nullable.map((columnName) => ({ columnName, isNullable: "YES", tableName: "chat_message_deliveries" })),
  ];

  assert.deepEqual(validateChatMessageDeliverySchema({ columns, constraints }), []);
  const legacyErrors = validateChatMessageDeliverySchema({
    columns: columns.map((column) => column.columnName === "completed_at" ? { ...column, columnName: "delivered_at" } : column),
    constraints: constraints.map((constraint) => constraint.constraintName === "chat_message_deliveries_status_check"
      ? { ...constraint, definition: "CHECK (status IN ('pending', 'processing', 'delivered', 'failed'))" }
      : constraint),
  });
  assert.ok(legacyErrors.some((error) => error.includes("completed_at")));
  assert.ok(legacyErrors.some((error) => error.includes("delivered_at")));
  assert.ok(legacyErrors.some((error) => error.includes("legacy delivered/failed")));
});

test("migration preserves historical rows only as legacy processed outcomes", () => {
  const migration = readFileSync(new URL("../drizzle/0088_chat_delivery_truthful_outcomes.sql", import.meta.url), "utf8");
  assert.match(migration, /WHERE "status" = 'delivered'/);
  assert.match(migration, /"status" = 'completed'/);
  assert.match(migration, /"outcome" = 'legacy_processed'/);
  assert.match(migration, /'dead_letter'/);
  assert.doesNotMatch(migration, /IN \([^)]*'delivered'/);
});

test("expired final-attempt leases go to dead letter instead of exceeding finite retry limits", () => {
  const outbox = readFileSync(new URL("../server/chat/chatMessageDeliveryOutbox.ts", import.meta.url), "utf8");
  assert.match(outbox, /await client\.query\("BEGIN"\)/);
  assert.match(outbox, /status = 'dead_letter', outcome = 'failed'/);
  assert.match(outbox, /attempts >= CASE transport WHEN 'realtime' THEN \$1::integer/);
  assert.match(outbox, /attempts < CASE transport WHEN 'realtime' THEN \$4::integer/);
  assert.match(outbox, /await client\.query\("COMMIT"\)/);
});
