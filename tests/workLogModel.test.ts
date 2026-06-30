import assert from "node:assert/strict";
import test from "node:test";
import { objectiveFlowStatuses } from "../src/domain/orfLifecycle";
import {
  canSelectObjectiveForWorkLog,
  workLogObjectiveAlwaysSelectableFlowStatuses,
  workLogObjectiveSelectionCandidateFlowStatuses,
} from "../src/domain/orfWorkLogs";

test("work log target selection excludes completed objectives without date context", () => {
  assert.equal(canSelectObjectiveForWorkLog("accepted"), false);
  assert.equal(canSelectObjectiveForWorkLog("settled"), false);
  assert.equal(canSelectObjectiveForWorkLog({ flowStatus: "closed" }), false);
  assert.equal(canSelectObjectiveForWorkLog("frozen"), true);
  assert.equal(canSelectObjectiveForWorkLog("revisionRequired"), true);

  assert.deepEqual(
    objectiveFlowStatuses.filter((flowStatus) => !workLogObjectiveAlwaysSelectableFlowStatuses.includes(flowStatus)),
    ["accepted", "settled", "closed"],
  );
  assert.ok(workLogObjectiveSelectionCandidateFlowStatuses.includes("accepted"));
  assert.ok(workLogObjectiveSelectionCandidateFlowStatuses.includes("settled"));
});

test("work log target selection keeps accepted objectives writable on acceptance day only", () => {
  const acceptedObjective = {
    acceptedAt: "2026-06-30T08:15:00",
    flowStatus: "accepted" as const,
  };

  assert.equal(canSelectObjectiveForWorkLog(acceptedObjective, { workDate: "2026-06-30" }), true);
  assert.equal(canSelectObjectiveForWorkLog(acceptedObjective, { workDate: "2026-06-29" }), false);
  assert.equal(canSelectObjectiveForWorkLog(acceptedObjective, { workDate: "2026-07-01" }), false);
  assert.equal(canSelectObjectiveForWorkLog({ ...acceptedObjective, acceptedAt: null }, { workDate: "2026-06-30" }), false);
});

test("work log target selection keeps settled objectives writable on settlement day only", () => {
  const settledObjective = {
    flowStatus: "settled" as const,
    settledAt: "2026-07-02T17:40:00",
  };

  assert.equal(canSelectObjectiveForWorkLog(settledObjective, { workDate: "2026-07-02" }), true);
  assert.equal(canSelectObjectiveForWorkLog(settledObjective, { workDate: "2026-07-01" }), false);
  assert.equal(canSelectObjectiveForWorkLog(settledObjective, { workDate: "2026-07-03" }), false);
  assert.equal(canSelectObjectiveForWorkLog({ ...settledObjective, settledAt: null }, { workDate: "2026-07-02" }), false);
  assert.equal(canSelectObjectiveForWorkLog({ flowStatus: "closed", settledAt: settledObjective.settledAt }, { workDate: "2026-07-02" }), false);
});
