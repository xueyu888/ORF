import assert from "node:assert/strict";
import test from "node:test";
import {
  canEditObjectiveDeadline,
  minimumObjectiveDeadlineValue,
  resolveObjectiveDeadlineEditState,
  validateObjectiveDeadlineChange,
} from "../src/domain/orfDeadline";
import type { ObjectiveFlowStatus } from "../src/types/orf";

test("objective deadline changes are open before freeze and locked after submission", () => {
  for (const flowStatus of ["candidate", "open", "applying", "recruiting", "reestimating"] satisfies ObjectiveFlowStatus[]) {
    assert.equal(canEditObjectiveDeadline(target(flowStatus)), true);
    assert.deepEqual(validateObjectiveDeadlineChange(target(flowStatus), "2026-06-12"), { status: "allowed", mode: "edit" });
  }

  for (const flowStatus of ["submitted", "settled", "closed"] satisfies ObjectiveFlowStatus[]) {
    assert.equal(canEditObjectiveDeadline(target(flowStatus)), false);
    assert.deepEqual(validateObjectiveDeadlineChange(target(flowStatus), "2026-06-12"), { status: "locked" });
  }
});

test("frozen objective deadline changes only allow extensions", () => {
  const frozen = target("frozen", "2026-06-10");

  assert.equal(canEditObjectiveDeadline(frozen), true);
  assert.equal(minimumObjectiveDeadlineValue(frozen), "2026-06-11");
  assert.deepEqual(validateObjectiveDeadlineChange(frozen, "2026-06-11"), { status: "allowed", mode: "extendFrozen" });
  assert.deepEqual(validateObjectiveDeadlineChange(frozen, "2026-06-10"), { status: "frozenMustExtend" });
  assert.deepEqual(validateObjectiveDeadlineChange(frozen, "2026-06-09"), { status: "frozenMustExtend" });
});

test("objective deadline edit state combines commander permission and lifecycle", () => {
  assert.deepEqual(resolveObjectiveDeadlineEditState(target("open"), "member"), { status: "blocked", reason: "noPermission" });
  assert.deepEqual(resolveObjectiveDeadlineEditState(target("open"), "admin"), { status: "editable", mode: "edit" });
  assert.deepEqual(resolveObjectiveDeadlineEditState(target("frozen"), "admin"), { status: "editable", mode: "extendFrozen" });
  assert.deepEqual(resolveObjectiveDeadlineEditState(target("submitted"), "admin"), { status: "blocked", reason: "lifecycleLocked" });
  assert.deepEqual(resolveObjectiveDeadlineEditState(target("submitted"), "member"), { status: "blocked", reason: "lifecycleLocked" });
  assert.deepEqual(resolveObjectiveDeadlineEditState(null, "admin"), { status: "blocked", reason: "missingObjective" });
});

test("objective deadline changes reject invalid date strings before lifecycle checks", () => {
  assert.deepEqual(validateObjectiveDeadlineChange(target("submitted"), "not-a-date"), { status: "invalidDate" });
});

function target(flowStatus: ObjectiveFlowStatus, finalDueAt = "2026-06-10") {
  return { finalDueAt, flowStatus };
}
