import assert from "node:assert/strict";
import test from "node:test";
import { objectiveFlowStatuses } from "../src/domain/orfLifecycle";
import {
  canSelectObjectiveForWorkLog,
  workLogObjectiveSelectableFlowStatuses,
} from "../src/domain/orfWorkLogs";

test("work log target selection excludes accepted, settled and closed objectives", () => {
  assert.equal(canSelectObjectiveForWorkLog("accepted"), false);
  assert.equal(canSelectObjectiveForWorkLog("settled"), false);
  assert.equal(canSelectObjectiveForWorkLog({ flowStatus: "closed" }), false);
  assert.equal(canSelectObjectiveForWorkLog("frozen"), true);
  assert.equal(canSelectObjectiveForWorkLog("revisionRequired"), true);

  assert.deepEqual(
    objectiveFlowStatuses.filter((flowStatus) => !workLogObjectiveSelectableFlowStatuses.includes(flowStatus)),
    ["accepted", "settled", "closed"],
  );
});
