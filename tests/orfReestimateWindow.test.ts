import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateObjectiveReestimateDueAt,
  REESTIMATE_WINDOW_HALF_DAY_MS,
  REESTIMATE_WINDOW_MAX_HALF_DAYS,
  resolveObjectiveReestimateWindowSync,
  validateFrozenReestimateReopenDueAt,
} from "../src/domain/orfReestimateWindow";

test("objective reestimate due date moves with the final deadline", () => {
  const acceptedAt = "2026-06-01T00:00:00.000Z";
  const earlyDueAt = calculateObjectiveReestimateDueAt("2026-06-03", acceptedAt);
  const laterDueAt = calculateObjectiveReestimateDueAt("2026-06-08", acceptedAt);

  assert.ok(earlyDueAt);
  assert.ok(laterDueAt);
  assert.ok(new Date(laterDueAt).getTime() > new Date(earlyDueAt).getTime());
});

test("objective reestimate due date is capped at nine days after acceptance", () => {
  const acceptedAt = "2026-06-01T00:00:00.000Z";
  const dueAt = calculateObjectiveReestimateDueAt("2026-12-31", acceptedAt);

  assert.ok(dueAt);
  assert.equal(
    new Date(dueAt).getTime() - new Date(acceptedAt).getTime(),
    REESTIMATE_WINDOW_MAX_HALF_DAYS * REESTIMATE_WINDOW_HALF_DAY_MS,
  );
});

test("objective reestimate due date rejects an invalid or too-short window", () => {
  assert.equal(calculateObjectiveReestimateDueAt("2026-06-01", "2026-06-01T12:00:00.000Z"), null);
  assert.equal(calculateObjectiveReestimateDueAt("2026-06-10", null), null);
});

test("objective reestimate window sync updates only active reestimating objectives", () => {
  const acceptedAt = "2026-06-01T00:00:00.000Z";
  const expectedDueAt = calculateObjectiveReestimateDueAt("2026-06-12", acceptedAt);
  assert.ok(expectedDueAt);

  assert.deepEqual(
    resolveObjectiveReestimateWindowSync(
      {
        acceptedAt,
        finalDueAt: "2026-06-10",
        flowStatus: "reestimating",
      },
      "2026-06-12",
    ),
    { status: "updated", confirmationDueAt: expectedDueAt },
  );

  assert.deepEqual(
    resolveObjectiveReestimateWindowSync(
      {
        acceptedAt,
        finalDueAt: "2026-06-10",
        flowStatus: "frozen",
      },
      "2026-06-12",
    ),
    { status: "unchanged" },
  );
});

test("objective reestimate window sync treats missing acceptance time as invalid", () => {
  assert.deepEqual(
    resolveObjectiveReestimateWindowSync(
      {
        acceptedAt: null,
        finalDueAt: "2026-06-10",
        flowStatus: "reestimating",
      },
      "2026-06-12",
    ),
    { status: "invalid" },
  );
});

test("frozen reestimate reopen requires a future due time before the final deadline", () => {
  const now = new Date("2026-06-08T00:00:00.000Z");

  assert.deepEqual(
    validateFrozenReestimateReopenDueAt(
      { finalDueAt: "2026-06-10", flowStatus: "frozen" },
      "2026-06-09T00:00:00.000Z",
      now,
    ),
    { status: "allowed", confirmationDueAt: "2026-06-09T00:00:00.000Z" },
  );

  assert.deepEqual(
    validateFrozenReestimateReopenDueAt(
      { finalDueAt: "2026-06-10", flowStatus: "reestimating" },
      "2026-06-09T00:00:00.000Z",
      now,
    ),
    { status: "blocked", reason: "lifecycleLocked" },
  );

  assert.deepEqual(
    validateFrozenReestimateReopenDueAt(
      { finalDueAt: "2026-06-10", flowStatus: "frozen" },
      "2026-06-07T23:00:00.000Z",
      now,
    ),
    { status: "blocked", reason: "reestimateDueAtNotFuture" },
  );

  assert.deepEqual(
    validateFrozenReestimateReopenDueAt(
      { finalDueAt: "2026-06-10", flowStatus: "frozen" },
      "2026-06-11T23:00:00.000Z",
      now,
    ),
    { status: "blocked", reason: "reestimateDueAtAfterFinalDueAt" },
  );
});
