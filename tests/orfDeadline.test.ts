import assert from "node:assert/strict";
import test from "node:test";
import {
  canEditObjectiveDeadline,
  minimumObjectiveDeadlineValue,
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

test("objective deadline changes reject invalid date strings before lifecycle checks", () => {
  assert.deepEqual(validateObjectiveDeadlineChange(target("submitted"), "not-a-date"), { status: "invalidDate" });
});

function target(flowStatus: ObjectiveFlowStatus, finalDueAt = "2026-06-10") {
  return { finalDueAt, flowStatus };
}
