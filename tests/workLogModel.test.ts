import assert from "node:assert/strict";
import test from "node:test";
import { objectiveFlowStatuses } from "../src/domain/orfLifecycle";
import {
  canAttachObjectiveToWorkLog,
  canSelectObjectiveForWorkLog,
  canShowObjectiveInDefaultWorkLogList,
  isObjectiveCompletedForWorkLog,
  isWorkLogSearchOnlyObjective,
  workLogObjectiveAlwaysSelectableFlowStatuses,
  workLogObjectiveCompletedSearchFlowStatuses,
  workLogObjectiveDefaultFlowStatuses,
  workLogObjectiveSearchOnlyFlowStatuses,
  workLogObjectiveSelectionCandidateFlowStatuses,
  workLogObjectiveSelectionAvailability,
} from "../src/domain/orfWorkLogs";

test("work log default target list only includes ongoing objectives", () => {
  assert.equal(canShowObjectiveInDefaultWorkLogList("accepted"), false);
  assert.equal(canShowObjectiveInDefaultWorkLogList("settled"), false);
  assert.equal(canShowObjectiveInDefaultWorkLogList({ flowStatus: "closed" }), false);
  assert.equal(canShowObjectiveInDefaultWorkLogList("frozen"), true);
  assert.equal(canShowObjectiveInDefaultWorkLogList("revisionRequired"), true);

  assert.deepEqual(
    objectiveFlowStatuses.filter((flowStatus) => !workLogObjectiveDefaultFlowStatuses.includes(flowStatus)),
    ["accepted", "settled", "closed"],
  );
  assert.deepEqual(workLogObjectiveAlwaysSelectableFlowStatuses, workLogObjectiveDefaultFlowStatuses);
});

test("work log target search and save include search-only objectives", () => {
  assert.ok(workLogObjectiveSelectionCandidateFlowStatuses.includes("accepted"));
  assert.ok(workLogObjectiveSelectionCandidateFlowStatuses.includes("settled"));
  assert.deepEqual(workLogObjectiveCompletedSearchFlowStatuses, ["accepted", "settled"]);
  assert.deepEqual(workLogObjectiveSearchOnlyFlowStatuses, ["accepted", "settled", "closed"]);

  assert.equal(canAttachObjectiveToWorkLog("accepted"), true);
  assert.equal(canAttachObjectiveToWorkLog("settled"), true);
  assert.equal(canAttachObjectiveToWorkLog("closed"), true);
  assert.equal(canSelectObjectiveForWorkLog("accepted"), true);
  assert.equal(canSelectObjectiveForWorkLog("settled"), true);
  assert.equal(canSelectObjectiveForWorkLog("closed"), true);
  assert.equal(isWorkLogSearchOnlyObjective("accepted"), true);
  assert.equal(isWorkLogSearchOnlyObjective("settled"), true);
  assert.equal(isWorkLogSearchOnlyObjective("closed"), true);
  assert.equal(isWorkLogSearchOnlyObjective("frozen"), false);
  assert.equal(workLogObjectiveSelectionAvailability("accepted"), "searchOnly");
  assert.equal(workLogObjectiveSelectionAvailability("settled"), "searchOnly");
  assert.equal(workLogObjectiveSelectionAvailability("frozen"), "default");
  assert.equal(workLogObjectiveSelectionAvailability("closed"), "searchOnly");
  assert.equal(isObjectiveCompletedForWorkLog("accepted"), true);
  assert.equal(isObjectiveCompletedForWorkLog("settled"), true);
  assert.equal(isObjectiveCompletedForWorkLog("closed"), true);
  assert.equal(isObjectiveCompletedForWorkLog("frozen"), false);
});
