import assert from "node:assert/strict";
import test from "node:test";
import {
  canUseFullCompletionSettlementMultiplier,
  canEditObjectiveBasePointsByFlow,
  objectiveSettlementReviewWindow,
  planObjectiveSettlementEvent,
} from "../src/domain/orfSettlement";
import { canSubmitObjectivePeerReview } from "../src/features/challenge/model/orfFlowCapabilities";
import type { Objective, OrfUser } from "../src/types/orf";

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

test("final completion settlement adds no points after deadline penalty", () => {
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
    multiplier: 0,
    settlementPoints: 0,
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

test("delayed final completion can be explicitly settled at full multiplier", () => {
  const multiplierInput = {
    acceptedResult: "completed" as const,
    finalDueAt: "2026-06-24",
    hasDeadlinePenaltyEvent: false,
    kind: "finalCompletion" as const,
    lootSubmittedAt: "2026-06-30T09:00:00.000Z",
  };

  assert.equal(canUseFullCompletionSettlementMultiplier(multiplierInput), true);
  assert.deepEqual(
    planObjectiveSettlementEvent({
      ...multiplierInput,
      basePoints: 100,
      settlementMultiplierMode: "fullCompletion",
    }),
    {
      kind: "finalCompletion",
      basePoints: 100,
      multiplier: 1,
      settlementPoints: 100,
    },
  );
});

test("full multiplier selection does not bypass prior deadline penalty", () => {
  const multiplierInput = {
    acceptedResult: "completed" as const,
    finalDueAt: "2026-06-24",
    hasDeadlinePenaltyEvent: true,
    kind: "finalCompletion" as const,
    lootSubmittedAt: "2026-06-30T09:00:00.000Z",
  };

  assert.equal(canUseFullCompletionSettlementMultiplier(multiplierInput), false);
  assert.deepEqual(
    planObjectiveSettlementEvent({
      ...multiplierInput,
      basePoints: 100,
      settlementMultiplierMode: "fullCompletion",
    }),
    {
      kind: "finalCompletion",
      basePoints: 100,
      multiplier: 0,
      settlementPoints: 0,
    },
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

test("objective base points stay editable until settlement is confirmed", () => {
  for (const flowStatus of [
    "candidate",
    "open",
    "applying",
    "recruiting",
    "reestimating",
    "frozen",
    "submitted",
    "accepted",
  ] as const) {
    assert.equal(canEditObjectiveBasePointsByFlow({ flowStatus }), true, flowStatus);
  }

  assert.equal(canEditObjectiveBasePointsByFlow({ flowStatus: "settled" }), false);
  assert.equal(canEditObjectiveBasePointsByFlow({ flowStatus: "closed" }), false);
});

test("member peer review action follows the settlement review window", () => {
  const member = {
    id: "member-1",
    role: "member",
  } as OrfUser;
  const objective = {
    challengerUserIds: ["member-1"],
    finalDueAt: "2026-06-24",
    flowStatus: "revisionRequired",
  } as Objective;

  assert.equal(
    canSubmitObjectivePeerReview({
      objective,
      currentUser: member,
      settlementEvents: [],
      today: "2026-06-25",
    }),
    true,
  );

  assert.equal(
    canSubmitObjectivePeerReview({
      objective,
      currentUser: member,
      settlementEvents: [{ kind: "deadlinePenalty" }],
      today: "2026-06-25",
    }),
    false,
  );
});
