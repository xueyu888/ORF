import assert from "node:assert/strict";
import test from "node:test";
import {
  clientUpdateReceiptRetentionVersions,
  clientUpdateReceiptStageTimestamps,
  retainedClientUpdateReceiptVersions,
} from "../server/clientUpdates/clientUpdateReceiptRepository";
import { validateClientUpdateReceiptSchema } from "../server/db/schemaGuard";
import { resolveClientUpdateReceiptStage } from "../src/features/client-updates/clientUpdateModel";

test("client update receipts retain the newest twenty semantic versions", () => {
  const versions = Array.from({ length: 25 }, (_, index) => `0.0.${index + 1}`);
  const retained = retainedClientUpdateReceiptVersions([
    ...versions,
    "0.0.25",
    "0.1.0",
  ]);

  assert.equal(retained.length, clientUpdateReceiptRetentionVersions);
  assert.deepEqual(retained.slice(0, 3), ["0.1.0", "0.0.25", "0.0.24"]);
  assert.equal(new Set(retained).size, retained.length);
  assert.equal(retained.includes("0.0.7"), true);
  assert.equal(retained.includes("0.0.6"), false);
});

test("client update receipt stages only set their own optional first-observed timestamp", () => {
  const observedAt = "2026-07-11T08:00:00.000Z";

  assert.deepEqual(clientUpdateReceiptStageTimestamps("checked", observedAt), {
    activatedAt: null,
    installStartedAt: null,
    promptedAt: null,
  });
  assert.deepEqual(clientUpdateReceiptStageTimestamps("prompted", observedAt), {
    activatedAt: null,
    installStartedAt: null,
    promptedAt: observedAt,
  });
  assert.deepEqual(clientUpdateReceiptStageTimestamps("install_started", observedAt), {
    activatedAt: null,
    installStartedAt: observedAt,
    promptedAt: null,
  });
  assert.deepEqual(clientUpdateReceiptStageTimestamps("activated", observedAt), {
    activatedAt: observedAt,
    installStartedAt: null,
    promptedAt: null,
  });
});

test("client update receipt activation is derived only from a running native version", () => {
  assert.equal(resolveClientUpdateReceiptStage({
    currentVersion: "0.0.86",
    releaseVersion: "0.0.87",
    stage: "checked",
  }), "checked");
  assert.equal(resolveClientUpdateReceiptStage({
    currentVersion: "0.0.87",
    releaseVersion: "0.0.87",
    stage: "checked",
  }), "activated");
  assert.equal(resolveClientUpdateReceiptStage({
    currentVersion: "0.0.88",
    releaseVersion: "0.0.87",
    stage: "checked",
  }), "activated");
  assert.equal(resolveClientUpdateReceiptStage({
    currentVersion: "0.0.86",
    releaseVersion: "0.0.87",
    stage: "activated",
  }), null);
});

test("client update receipt schema guard requires durable identity and stage facts", () => {
  const required = [
    "team_id",
    "user_id",
    "release_version",
    "platform",
    "current_version",
    "checked_at",
    "created_at",
    "updated_at",
  ].map((columnName) => ({ columnName, isNullable: "NO", tableName: "client_update_receipts" }));
  const optional = ["prompted_at", "install_started_at", "activated_at"]
    .map((columnName) => ({ columnName, isNullable: "YES", tableName: "client_update_receipts" }));

  assert.deepEqual(validateClientUpdateReceiptSchema({ columns: [...required, ...optional] }), []);
  assert.deepEqual(validateClientUpdateReceiptSchema({ columns: required }), [
    "client_update_receipts.prompted_at is missing.",
    "client_update_receipts.install_started_at is missing.",
    "client_update_receipts.activated_at is missing.",
  ]);
});
