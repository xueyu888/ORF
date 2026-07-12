import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  CHAT_PUSH_DELIVERY_MAX_ATTEMPTS,
  ChatPushDeliveryAttemptError,
  chatPushDeliveryFailureCounts,
  decideChatPushDeliveryFailure,
  normalizeChatPushDeliveryResult,
  type ChatPushDeliveryClaim,
} from "../server/chat/chatPushDeliveryModel";
import { createChatPushDeliveryWorker } from "../server/chat/chatPushDeliveryWorker";
import { validateChatPushDeliverySchema, validateLegacyRealtimeDeliveryArchiveSchema } from "../server/db/schemaGuard";
import { withPushProviderDeadline } from "../server/push/firebasePushClient";
import { publishRealtimeEventToUser, subscribeRealtimeEvents } from "../server/realtime/realtimeEventBus";

function claim(id: string, overrides: Partial<ChatPushDeliveryClaim> = {}): ChatPushDeliveryClaim {
  return {
    attempts: 1,
    channelId: "channel-1",
    id,
    messageId: `message-${id}`,
    recipientUserId: "00000000-0000-4000-8000-000000000001",
    teamId: "team-1",
    ...overrides,
  };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((next) => { resolve = next; });
  return { promise, resolve };
}

test("push failures use one finite retry policy and end in dead letter", () => {
  assert.equal(CHAT_PUSH_DELIVERY_MAX_ATTEMPTS, 12);
  assert.equal(decideChatPushDeliveryFailure({ attempts: 11 }, new Date(0)).status, "retry_scheduled");
  assert.equal(decideChatPushDeliveryFailure({ attempts: 12 }, new Date(0)).status, "dead_letter");
  assert.deepEqual(chatPushDeliveryFailureCounts(new ChatPushDeliveryAttemptError("failed", {
    failureCount: 2,
    successCount: 0,
    targetCount: 2,
  })), { failureCount: 2, successCount: 0, targetCount: 2 });
});

test("push result counters accept only push outcomes", () => {
  assert.deepEqual(normalizeChatPushDeliveryResult({
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
  assert.throws(() => normalizeChatPushDeliveryResult({
    failureCount: 0,
    outcome: "push_accepted",
    successCount: 0,
    targetCount: 0,
  }), /Invalid push_accepted/);
});

test("worker leases at most its global concurrency and drains with trailing claims", async () => {
  const claims = [claim("1"), claim("2"), claim("3")];
  let claimCalls = 0;
  let active = 0;
  let maximumActive = 0;
  const finished = deferred();
  const worker = createChatPushDeliveryWorker({
    claim: async (limit) => {
      assert.equal(limit, 3);
      claimCalls += 1;
      return claimCalls === 1 ? claims : [];
    },
    complete: async () => true,
    deliver: async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active -= 1;
      return { failureCount: 0, outcome: "push_accepted", successCount: 1, targetCount: 1 };
    },
    fail: async () => ({ persisted: true, status: "retry_scheduled" }),
    onBatch: (result) => {
      if (result.attempted === claims.length) finished.resolve();
    },
  }, 3);
  worker.request();
  await finished.promise;
  await worker.stop();
  assert.equal(maximumActive, 3);
  assert.equal(claimCalls, 1);
});

test("a hung push reaches a hard deadline and cannot block realtime delivery", async () => {
  const teamId = "push-isolation-team";
  const userId = "push-isolation-user";
  const received = deferred();
  const unsubscribe = subscribeRealtimeEvents({ teamId, userId, send: () => received.resolve() });
  const workerFinished = deferred();
  const worker = createChatPushDeliveryWorker({
    claim: async () => [claim("hung")],
    complete: async () => true,
    deliver: async () => withPushProviderDeadline(new Promise<never>(() => undefined), 20),
    fail: async () => ({ persisted: true, status: "retry_scheduled" }),
    onBatch: () => workerFinished.resolve(),
  }, 1);
  try {
    worker.request();
    const result = publishRealtimeEventToUser(teamId, userId, {
      createdAt: "2026-07-12T00:00:00.000Z",
      id: "chat-wakeup",
      kind: "chat.event",
      eventType: "message.created",
      channelId: "channel-1",
      messageId: "message-1",
    });
    assert.deepEqual(result, { failureCount: 0, successCount: 1, targetCount: 1 });
    await received.promise;
    await workerFinished.promise;
  } finally {
    unsubscribe();
    await worker.stop();
  }
});

test("schema guard rejects transport and realtime outcomes from the push queue", () => {
  const required = [
    "id", "message_id", "team_id", "channel_id", "recipient_user_id", "status", "attempts",
    "target_count", "success_count", "failure_count", "created_at", "updated_at",
  ];
  const nullable = ["outcome", "last_error", "next_attempt_at", "lease_expires_at", "completed_at"];
  const constraints = [
    { constraintName: "chat_push_deliveries_status_check", definition: "CHECK (status IN ('pending', 'processing', 'retry_scheduled', 'completed', 'dead_letter'))" },
    { constraintName: "chat_push_deliveries_outcome_check", definition: "CHECK (outcome IN ('legacy_processed', 'push_accepted', 'push_partially_accepted', 'push_rejected', 'no_push_device', 'push_disabled', 'not_applicable', 'failed'))" },
    { constraintName: "chat_push_deliveries_counts_check", definition: "CHECK (target_count >= 0)" },
    { constraintName: "chat_push_deliveries_state_shape_check", definition: "CHECK (status IS NOT NULL)" },
  ];
  const columns = [
    ...required.map((columnName) => ({ columnName, isNullable: "NO", tableName: "chat_push_deliveries" })),
    ...nullable.map((columnName) => ({ columnName, isNullable: "YES", tableName: "chat_push_deliveries" })),
  ];
  assert.deepEqual(validateChatPushDeliverySchema({ columns, constraints }), []);
  const errors = validateChatPushDeliverySchema({
    columns: [...columns, { columnName: "transport", isNullable: "NO", tableName: "chat_push_deliveries" }],
    constraints: constraints.map((item) => item.constraintName === "chat_push_deliveries_outcome_check"
      ? { ...item, definition: `${item.definition} 'sent_to_connection'` }
      : item),
  });
  assert.ok(errors.some((error) => error.includes("transport must not exist")));
  assert.ok(errors.some((error) => error.includes("sent_to_connection")));
});

test("legacy realtime diagnostics are explicit, non-pickable and expire after 30 days", () => {
  const migration = readFileSync(new URL("../drizzle/0089_isolate_chat_push_delivery.sql", import.meta.url), "utf8");
  assert.match(migration, /CREATE TABLE "chat_legacy_realtime_deliveries"/);
  assert.match(migration, /'legacy_realtime_retired'/);
  assert.match(migration, /interval '30 days'/);
  assert.match(migration, /DELETE FROM "chat_message_deliveries" WHERE "transport" = 'realtime'/);
  assert.match(migration, /RENAME TO "chat_push_deliveries"/);
  assert.deepEqual(validateLegacyRealtimeDeliveryArchiveSchema({ columns: [
    "id", "status", "final_reason", "original_status", "completed_at", "purge_after",
  ].map((columnName) => ({ columnName, isNullable: "NO", tableName: "chat_legacy_realtime_deliveries" })) }), []);
});

test("active chat push modules contain no realtime outbox path", () => {
  const outbox = readFileSync(new URL("../server/chat/chatPushDeliveryOutbox.ts", import.meta.url), "utf8");
  const worker = readFileSync(new URL("../server/chat/chatPushDeliveryWorker.ts", import.meta.url), "utf8");
  const app = readFileSync(new URL("../server/app.ts", import.meta.url), "utf8");
  const repository = readFileSync(new URL("../server/repositories/chatRepository.ts", import.meta.url), "utf8");
  const realtime = readFileSync(new URL("../server/chat/chatMessageRealtime.ts", import.meta.url), "utf8");
  const channelRealtime = readFileSync(new URL("../server/chat/chatChannelRealtime.ts", import.meta.url), "utf8");
  const realtimeTypes = readFileSync(new URL("../src/types/realtime.ts", import.meta.url), "utf8");
  const chatPage = readFileSync(new URL("../src/pages/ChatPage.tsx", import.meta.url), "utf8");
  const provider = readFileSync(new URL("../src/state/OrfProvider.tsx", import.meta.url), "utf8");
  assert.match(outbox, /INSERT INTO chat_push_deliveries/);
  assert.doesNotMatch(`${outbox}\n${worker}`, /transport|chat_message_deliveries|realtime/i);
  assert.doesNotMatch(`${app}\n${repository}`, /chatMessageDelivery|publishPersonalizedMessageRealtimeEvent/);
  assert.match(realtime, /publishChatMessageMutationRealtime/);
  assert.doesNotMatch(`${realtime}\n${channelRealtime}`, /getVisibleChannel|getMessageById/);
  assert.doesNotMatch(realtimeTypes, /\bchannel\?:\s*ChatChannel|\bmessage\?:\s*ChatMessage/);
  assert.doesNotMatch(chatPage, /payload\.(?:channel|message)\b/);
  assert.match(chatPage, /chatPageReconciliation\.request\("realtime-event"\)/);
  assert.match(provider, /chatAttentionReconciliation\.request\("realtime-event"\)/);
});
