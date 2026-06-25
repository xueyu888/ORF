import assert from "node:assert/strict";
import test from "node:test";
import {
  objectiveSettlementReviewWindow,
  planObjectiveSettlementEvent,
} from "../src/domain/orfSettlement";

test("deadline penalty settlement awards half points even when acceptance failed", () => {
  const event = planObjectiveSettlementEvent({
    acceptedResult: "abandoned",
    basePoints: 100,
    finalDueAt: "2026-06-24",
    hasDeadlinePenaltyEvent: false,
    kind: "deadlinePenalty",
    lootSubmittedAt: "2026-06-24T09:00:00.000Z",
  });

  assert.deepEqual(event, {
    kind: "deadlinePenalty",
    basePoints: 100,
    multiplier: 0.5,
    settlementPoints: 50,
  });
});

test("final completion settlement supplies the remaining half after penalty", () => {
  const event = planObjectiveSettlementEvent({
    acceptedResult: "completed",
    basePoints: 100,
    finalDueAt: "2026-06-24",
    hasDeadlinePenaltyEvent: true,
    kind: "finalCompletion",
    lootSubmittedAt: "2026-06-30T09:00:00.000Z",
  });

  assert.deepEqual(event, {
    kind: "finalCompletion",
    basePoints: 100,
    multiplier: 0.5,
    settlementPoints: 50,
  });
});

test("final completion without prior penalty follows the original deadline multiplier", () => {
  assert.equal(
    planObjectiveSettlementEvent({
      acceptedResult: "completed",
      basePoints: 100,
      finalDueAt: "2026-06-24",
      hasDeadlinePenaltyEvent: false,
      kind: "finalCompletion",
      lootSubmittedAt: "2026-06-24T09:00:00.000Z",
    }).settlementPoints,
    100,
  );

  assert.equal(
    planObjectiveSettlementEvent({
      acceptedResult: "completed",
      basePoints: 100,
      finalDueAt: "2026-06-24",
      hasDeadlinePenaltyEvent: false,
      kind: "finalCompletion",
      lootSubmittedAt: "2026-06-30T09:00:00.000Z",
    }).settlementPoints,
    50,
  );
});

test("settlement review window closes after the current event is settled", () => {
  assert.deepEqual(
    objectiveSettlementReviewWindow({
      objective: { finalDueAt: "2026-06-24", flowStatus: "revisionRequired" },
      settlementEvents: [],
      today: "2026-06-25",
    }),
    { kind: "deadlinePenalty", open: true, reason: "open" },
  );

  assert.deepEqual(
    objectiveSettlementReviewWindow({
      objective: { finalDueAt: "2026-06-24", flowStatus: "revisionRequired" },
      settlementEvents: [{ kind: "deadlinePenalty" }],
      today: "2026-06-25",
    }),
    { kind: "deadlinePenalty", open: false, reason: "alreadySettled" },
  );

  assert.deepEqual(
    objectiveSettlementReviewWindow({
      objective: { finalDueAt: "2026-06-24", flowStatus: "accepted" },
      settlementEvents: [{ kind: "deadlinePenalty" }],
      today: "2026-06-30",
    }),
    { kind: "finalCompletion", open: true, reason: "open" },
  );
});

test("deadline penalty review window stays closed before the due date", () => {
  assert.deepEqual(
    objectiveSettlementReviewWindow({
      objective: { finalDueAt: "2026-06-30", flowStatus: "revisionRequired" },
      settlementEvents: [],
      today: "2026-06-25",
    }),
    { kind: "deadlinePenalty", open: false, reason: "deadlinePending" },
  );
});
