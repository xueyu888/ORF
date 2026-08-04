import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLootMetricClaims,
  firstLootMetricClaimMissingEvidence,
  reconcileLootMetricClaimDrafts,
  summarizeLootMetricChecklist,
  type LootMetricClaimDrafts,
} from "../src/domain/lootMetricChecklist";

const results = [{ id: "metric-1" }, { id: "metric-2" }, { id: "metric-3" }];

test("loot metric checklist initializes every metric as not claimed", () => {
  assert.deepEqual(reconcileLootMetricClaimDrafts(results, {}), {
    "metric-1": { claim: "notClaimed", evidenceText: "" },
    "metric-2": { claim: "notClaimed", evidenceText: "" },
    "metric-3": { claim: "notClaimed", evidenceText: "" },
  });
});

test("loot metric checklist preserves current metric drafts and removes stale metrics", () => {
  const drafts: LootMetricClaimDrafts = {
    "metric-1": { claim: "completed", evidenceText: "done" },
    "metric-old": { claim: "completed", evidenceText: "stale" },
  };

  assert.deepEqual(reconcileLootMetricClaimDrafts(results, drafts), {
    "metric-1": { claim: "completed", evidenceText: "done" },
    "metric-2": { claim: "notClaimed", evidenceText: "" },
    "metric-3": { claim: "notClaimed", evidenceText: "" },
  });
});

test("loot metric checklist builds trimmed claims and clears unclaimed evidence", () => {
  const claims = buildLootMetricClaims(results, {
    "metric-1": { claim: "completed", evidenceText: "  proof  " },
    "metric-2": { claim: "notClaimed", evidenceText: "old proof" },
    "metric-3": { claim: "falsified", evidenceText: "  report  " },
  });

  assert.deepEqual(claims, [
    { resultId: "metric-1", claim: "completed", evidenceText: "proof" },
    { resultId: "metric-2", claim: "notClaimed", evidenceText: "" },
    { resultId: "metric-3", claim: "falsified", evidenceText: "report" },
  ]);
});

test("loot metric checklist requires evidence only for completed or falsified metrics", () => {
  assert.equal(
    firstLootMetricClaimMissingEvidence([
      { resultId: "metric-1", claim: "notClaimed", evidenceText: "" },
    ]),
    null,
  );
  assert.deepEqual(
    firstLootMetricClaimMissingEvidence([
      { resultId: "metric-1", claim: "completed", evidenceText: "" },
      { resultId: "metric-2", claim: "falsified", evidenceText: "report" },
    ]),
    { resultId: "metric-1", claim: "completed", evidenceText: "" },
  );
});

test("loot metric checklist summarizes checked metrics separately from falsified metrics", () => {
  assert.deepEqual(
    summarizeLootMetricChecklist(results, {
      "metric-1": { claim: "completed", evidenceText: "proof" },
      "metric-2": { claim: "falsified", evidenceText: "report" },
    }),
    {
      completed: 1,
      falsified: 1,
      claimed: 2,
      notClaimed: 1,
      total: 3,
    },
  );
});
