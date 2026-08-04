import assert from "node:assert/strict";
import test from "node:test";
import {
  completedMetricIdsFromDrafts,
  pruneMetricCompletionDrafts,
  setMetricCompletionDraft,
  type MetricCompletionDrafts,
} from "../src/features/challenge/model/metricCompletionDrafts";

test("metric completion drafts expose checked metric ids", () => {
  const checked = completedMetricIdsFromDrafts({
    "metric-1": true,
    "metric-2": true,
  });

  assert.equal(checked.has("metric-1"), true);
  assert.equal(checked.has("metric-2"), true);
  assert.equal(checked.has("metric-3"), false);
});

test("metric completion drafts toggle entries without mutating the current draft", () => {
  const drafts: MetricCompletionDrafts = { "metric-1": true };
  const withMetricTwo = setMetricCompletionDraft(drafts, "metric-2", true);
  const withoutMetricOne = setMetricCompletionDraft(withMetricTwo, "metric-1", false);

  assert.deepEqual(drafts, { "metric-1": true });
  assert.deepEqual(withMetricTwo, { "metric-1": true, "metric-2": true });
  assert.deepEqual(withoutMetricOne, { "metric-2": true });
  assert.equal(setMetricCompletionDraft(withoutMetricOne, "metric-2", true), withoutMetricOne);
  assert.equal(setMetricCompletionDraft(withoutMetricOne, "metric-old", false), withoutMetricOne);
});

test("metric completion drafts drop metrics that leave the current challenge snapshot", () => {
  const drafts: MetricCompletionDrafts = {
    "metric-1": true,
    "metric-old": true,
  };

  assert.deepEqual(pruneMetricCompletionDrafts(drafts, new Set(["metric-1", "metric-2"])), {
    "metric-1": true,
  });
  assert.equal(pruneMetricCompletionDrafts(drafts, new Set(["metric-1", "metric-old"])), drafts);
});
