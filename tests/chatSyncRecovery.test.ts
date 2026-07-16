import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  CHAT_SYNC_PROTOCOL_VERSION,
  chatSyncEventTypes,
  chatSyncMetadataKeysByEventType,
  parseStoredChatSyncCursor,
  type ChatSyncResponse,
  type StoredChatSyncCursor,
} from "../src/domain/chatSync";
import { resolveChatSyncCheckpoint } from "../src/features/chat/chatSyncRecovery";
import { sanitizeChatSyncMetadata } from "../server/chat/chatSyncEventModel";
import {
  CHAT_SYNC_EVENT_MAX_PER_TEAM,
  CHAT_SYNC_EVENT_RETENTION_DAYS,
} from "../server/chat/chatSyncEventRetentionScheduler";
import { validateChatSyncEventSchema } from "../server/db/schemaGuard";

const fingerprintA = "a".repeat(64);
const fingerprintB = "b".repeat(64);

function response(overrides: Partial<ChatSyncResponse> = {}): ChatSyncResponse {
  return {
    events: [],
    fallbackReason: null,
    hasMore: false,
    mode: "incremental",
    nextCursor: "10",
    permissionFingerprint: fingerprintA,
    protocolVersion: CHAT_SYNC_PROTOCOL_VERSION,
    teamId: "team-1",
    ...overrides,
  };
}

test("chat sync metadata strips message bodies, attachment data and unknown future fields", () => {
  assert.deepEqual(sanitizeChatSyncMetadata("message.created", {
    attachmentBody: "secret attachment",
    body: "secret message",
    content: "secret content",
    parentMessageId: "parent-1",
    rootMessageId: "root-1",
    version: "2026-07-11T10:00:00.000Z",
  }), {
    parentMessageId: "parent-1",
    rootMessageId: "root-1",
    version: "2026-07-11T10:00:00.000Z",
  });
});

test("stored chat sync cursors require a team, installation-scoped permission fingerprint and decimal cursor", () => {
  const valid: StoredChatSyncCursor = {
    cursor: "123",
    permissionFingerprint: fingerprintA,
    protocolVersion: CHAT_SYNC_PROTOCOL_VERSION,
    teamId: "team-1",
  };
  assert.deepEqual(parseStoredChatSyncCursor(valid), valid);
  assert.equal(parseStoredChatSyncCursor({ ...valid, cursor: "12.3" }), null);
  assert.equal(parseStoredChatSyncCursor({ ...valid, cursor: "9223372036854775808" }), null);
  assert.equal(parseStoredChatSyncCursor({ ...valid, permissionFingerprint: "short" }), null);
  assert.equal(parseStoredChatSyncCursor({ ...valid, protocolVersion: 2 }), null);
});

test("chat sync recovery drains every incremental page before returning one durable checkpoint", async () => {
  const requests: Array<string | undefined> = [];
  const checkpoint = await resolveChatSyncCheckpoint({
    storedCursor: {
      cursor: "10",
      permissionFingerprint: fingerprintA,
      protocolVersion: CHAT_SYNC_PROTOCOL_VERSION,
      teamId: "team-1",
    },
    fetchPage: async (request) => {
      requests.push(request.cursor);
      return requests.length === 1
        ? response({ hasMore: true, nextCursor: "20" })
        : response({ nextCursor: "30" });
    },
  });
  assert.deepEqual(requests, ["10", "20"]);
  assert.deepEqual(checkpoint, {
    cursor: "30",
    permissionFingerprint: fingerprintA,
    teamId: "team-1",
  });
});

test("a cursor from another team is discarded and retried through full reconciliation", async () => {
  const requests: Array<{ cursor?: string; permissionFingerprint?: string }> = [];
  const checkpoint = await resolveChatSyncCheckpoint({
    storedCursor: {
      cursor: "99",
      permissionFingerprint: fingerprintB,
      protocolVersion: CHAT_SYNC_PROTOCOL_VERSION,
      teamId: "old-team",
    },
    fetchPage: async (request) => {
      requests.push(request);
      return requests.length === 1
        ? response({ nextCursor: "100", permissionFingerprint: fingerprintA, teamId: "team-1" })
        : response({ fallbackReason: "cursor_missing", mode: "full", nextCursor: "101" });
    },
  });
  assert.equal(requests[0]?.cursor, "99");
  assert.equal(requests[0]?.permissionFingerprint, fingerprintB);
  assert.equal(requests[1]?.cursor, undefined);
  assert.equal(requests[1]?.permissionFingerprint, undefined);
  assert.equal(checkpoint.cursor, "101");
  assert.equal(checkpoint.teamId, "team-1");
});

test("retention and schema contracts enforce the approved 30-day and one-million-per-team boundary", () => {
  assert.equal(CHAT_SYNC_EVENT_RETENTION_DAYS, 30);
  assert.equal(CHAT_SYNC_EVENT_MAX_PER_TEAM, 1_000_000);
  assert.deepEqual(validateChatSyncEventSchema({
    columns: [
      "seq", "team_id", "protocol_version", "event_type", "object_type", "object_id",
      "channel_id", "actor_user_id", "occurred_at", "metadata_json",
    ].map((columnName) => ({ columnName, isNullable: columnName === "actor_user_id" ? "YES" : "NO", tableName: "chat_sync_events" })),
    constraints: [{ constraintName: "chat_sync_events_metadata_keys_check", definition: "CHECK (...)" }],
  }), []);
});

test("chat sync migration stores one logical event shape without recipient rows or duplicated content columns", async () => {
  const migration = await readFile(new URL("../drizzle/0086_chat_sync_events.sql", import.meta.url), "utf8");
  const tableDefinition = migration.slice(0, migration.indexOf("--> statement-breakpoint"));
  assert.match(tableDefinition, /"team_id" text NOT NULL/);
  assert.match(tableDefinition, /"seq" bigserial PRIMARY KEY NOT NULL/);
  assert.match(tableDefinition, /"metadata_json" jsonb/);
  assert.doesNotMatch(tableDefinition, /recipient_user_id|message_body|attachment_body|"body"|"content"/i);
  assert.match(migration, /AFTER INSERT OR UPDATE OR DELETE ON chat_messages/);
  assert.match(migration, /'message\.created'/);
  const guardMigration = await readFile(new URL("../drizzle/0087_chat_sync_metadata_guard.sql", import.meta.url), "utf8");
  assert.match(guardMigration, /chat_sync_events_metadata_keys_check/);
  assert.match(guardMigration, /pg_column_size\("metadata_json"\) <= 4096/);
  assert.match(guardMigration, /"metadata_json" - ARRAY\['parentMessageId', 'rootMessageId', 'version'\]/);
  for (const eventType of chatSyncEventTypes) {
    assert.ok(migration.includes(`'${eventType}'`), `migration is missing ${eventType}`);
    for (const metadataKey of chatSyncMetadataKeysByEventType[eventType]) {
      assert.ok(guardMigration.includes(`'${metadataKey}'`), `metadata guard is missing ${eventType}.${metadataKey}`);
    }
  }
});
