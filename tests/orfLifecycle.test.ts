import assert from "node:assert/strict";
import test from "node:test";
import {
  canAcceptObjectiveChallengeByFlow,
  canApplyForObjectiveChallenge,
  canDeleteObjectiveByFlow,
  canFreezeObjectiveByFlow,
  canMutateObjectiveCommentsAsChallengerByFlow,
  canMutateObjectiveCommentsByFlow,
  canMutateObjectiveResultsByFlow,
  canMutateObjectiveWorkItemsByFlow,
  canPublishObjectiveByFlow,
  canRecruitObjectiveChallengersByFlow,
  canReviewObjectiveChallengeApplications,
  canReviewObjectiveLootByFlow,
  canSubmitObjectiveContributionReviewByFlow,
  canSubmitObjectiveLootByFlow,
  isObjectiveChallengeAcceptedByFlow,
  isObjectiveChallengeDiscoverableByFlow,
  isObjectiveChallengeEntryClosedByFlow,
  isObjectiveReestimateDueAtOpen,
  isObjectiveReestimateWindowOpen,
  isObjectiveReestimatingByFlow,
  isObjectiveResultLockedByFlow,
  isObjectiveSettledOrClosed,
  isObjectiveStageCompatibleWithFlowStatus,
  isObjectiveSubmittedByFlow,
  objectiveChallengeSortRank,
  objectiveFlowLabel,
  objectiveFlowPolicy,
  objectiveFlowPolicyFor,
  objectiveFlowStatusAfterChallengeApplication,
  objectiveFlowStatusAfterChallengeApplicationReview,
  objectiveFlowStatusAfterRecruitment,
  objectiveFlowStatuses,
  objectiveFlowTone,
  objectiveLifecycleInitialState,
  objectiveLifecycleTransitions,
  shouldRenderObjectiveAsFrozen,
} from "../src/domain/orfLifecycle";
import type { Objective, ObjectiveFlowStatus, OrfStage } from "../src/types/orf";

const lifecycleExpectations: Record<
  ObjectiveFlowStatus,
  {
    label: string;
    tone: ReturnType<typeof objectiveFlowTone>;
    sortRank: number;
    assignedSortRank?: number;
    publish: boolean;
    apply: boolean;
    reviewApplications: boolean;
    recruit: boolean;
    acceptChallenge: boolean;
    mutateResults: boolean;
    mutateWorkItems: boolean;
    mutateComments: boolean;
    mutateCommentsAsChallenger: boolean;
    deleteObjective: boolean;
    freeze: boolean;
    submitLoot: boolean;
    submitContributionReview: boolean;
    reviewLoot: boolean;
    discoverable: boolean;
    accepted: boolean;
    entryClosed: boolean;
    resultLocked: boolean;
    frozenRender: boolean;
    submitted: boolean;
    settledOrClosed: boolean;
  }
> = {
  candidate: {
    label: "候选中",
    tone: "open",
    sortRank: 0,
    publish: true,
    apply: false,
    reviewApplications: false,
    recruit: false,
    acceptChallenge: false,
    mutateResults: true,
    mutateWorkItems: true,
    mutateComments: true,
    mutateCommentsAsChallenger: false,
    deleteObjective: true,
    freeze: false,
    submitLoot: false,
    submitContributionReview: false,
    reviewLoot: false,
    discoverable: false,
    accepted: false,
    entryClosed: false,
    resultLocked: false,
    frozenRender: false,
    submitted: false,
    settledOrClosed: false,
  },
  open: {
    label: "可申请",
    tone: "open",
    sortRank: 1,
    assignedSortRank: 2,
    publish: false,
    apply: true,
    reviewApplications: false,
    recruit: true,
    acceptChallenge: false,
    mutateResults: true,
    mutateWorkItems: false,
    mutateComments: true,
    mutateCommentsAsChallenger: false,
    deleteObjective: true,
    freeze: false,
    submitLoot: false,
    submitContributionReview: false,
    reviewLoot: false,
    discoverable: true,
    accepted: false,
    entryClosed: false,
    resultLocked: false,
    frozenRender: false,
    submitted: false,
    settledOrClosed: false,
  },
  applying: {
    label: "申请中",
    tone: "active",
    sortRank: 1,
    assignedSortRank: 2,
    publish: false,
    apply: true,
    reviewApplications: true,
    recruit: true,
    acceptChallenge: false,
    mutateResults: true,
    mutateWorkItems: false,
    mutateComments: true,
    mutateCommentsAsChallenger: false,
    deleteObjective: true,
    freeze: false,
    submitLoot: false,
    submitContributionReview: false,
    reviewLoot: false,
    discoverable: true,
    accepted: false,
    entryClosed: false,
    resultLocked: false,
    frozenRender: false,
    submitted: false,
    settledOrClosed: false,
  },
  recruiting: {
    label: "征召中",
    tone: "active",
    sortRank: 1,
    assignedSortRank: 2,
    publish: false,
    apply: true,
    reviewApplications: true,
    recruit: true,
    acceptChallenge: true,
    mutateResults: true,
    mutateWorkItems: false,
    mutateComments: true,
    mutateCommentsAsChallenger: false,
    deleteObjective: true,
    freeze: false,
    submitLoot: false,
    submitContributionReview: false,
    reviewLoot: false,
    discoverable: true,
    accepted: false,
    entryClosed: false,
    resultLocked: false,
    frozenRender: false,
    submitted: false,
    settledOrClosed: false,
  },
  reestimating: {
    label: "重估中",
    tone: "active",
    sortRank: 3,
    publish: false,
    apply: false,
    reviewApplications: true,
    recruit: true,
    acceptChallenge: true,
    mutateResults: true,
    mutateWorkItems: true,
    mutateComments: true,
    mutateCommentsAsChallenger: true,
    deleteObjective: true,
    freeze: true,
    submitLoot: false,
    submitContributionReview: false,
    reviewLoot: false,
    discoverable: false,
    accepted: true,
    entryClosed: false,
    resultLocked: false,
    frozenRender: false,
    submitted: false,
    settledOrClosed: false,
  },
  frozen: {
    label: "已冻结",
    tone: "active",
    sortRank: 3,
    publish: false,
    apply: false,
    reviewApplications: false,
    recruit: false,
    acceptChallenge: false,
    mutateResults: false,
    mutateWorkItems: true,
    mutateComments: true,
    mutateCommentsAsChallenger: true,
    deleteObjective: true,
    freeze: false,
    submitLoot: true,
    submitContributionReview: false,
    reviewLoot: false,
    discoverable: false,
    accepted: true,
    entryClosed: false,
    resultLocked: true,
    frozenRender: true,
    submitted: false,
    settledOrClosed: false,
  },
  submitted: {
    label: "待验收",
    tone: "review",
    sortRank: 4,
    publish: false,
    apply: false,
    reviewApplications: false,
    recruit: false,
    acceptChallenge: false,
    mutateResults: false,
    mutateWorkItems: false,
    mutateComments: true,
    mutateCommentsAsChallenger: true,
    deleteObjective: false,
    freeze: false,
    submitLoot: false,
    submitContributionReview: true,
    reviewLoot: true,
    discoverable: false,
    accepted: false,
    entryClosed: true,
    resultLocked: true,
    frozenRender: true,
    submitted: true,
    settledOrClosed: false,
  },
  settled: {
    label: "已结算",
    tone: "done",
    sortRank: 5,
    publish: false,
    apply: false,
    reviewApplications: false,
    recruit: false,
    acceptChallenge: false,
    mutateResults: false,
    mutateWorkItems: false,
    mutateComments: false,
    mutateCommentsAsChallenger: false,
    deleteObjective: false,
    freeze: false,
    submitLoot: false,
    submitContributionReview: false,
    reviewLoot: false,
    discoverable: false,
    accepted: false,
    entryClosed: true,
    resultLocked: true,
    frozenRender: true,
    submitted: false,
    settledOrClosed: true,
  },
  closed: {
    label: "已关闭",
    tone: "open",
    sortRank: 6,
    publish: false,
    apply: false,
    reviewApplications: false,
    recruit: false,
    acceptChallenge: false,
    mutateResults: false,
    mutateWorkItems: false,
    mutateComments: false,
    mutateCommentsAsChallenger: false,
    deleteObjective: true,
    freeze: false,
    submitLoot: false,
    submitContributionReview: false,
    reviewLoot: false,
    discoverable: false,
    accepted: false,
    entryClosed: true,
    resultLocked: true,
    frozenRender: true,
    submitted: false,
    settledOrClosed: true,
  },
};

const stageCompatibility: Record<ObjectiveFlowStatus, readonly OrfStage[]> = {
  candidate: ["goalSetting", "resultClaiming", "orfReestimate"],
  open: ["goalSetting", "resultClaiming", "orfReestimate"],
  applying: ["goalSetting", "resultClaiming", "orfReestimate"],
  recruiting: ["goalSetting", "resultClaiming", "orfReestimate"],
  reestimating: ["orfReestimate"],
  frozen: ["goalFrozen"],
  submitted: ["goalFrozen"],
  settled: ["goalFrozen"],
  closed: ["goalFrozen"],
};

test("objective lifecycle policy is the complete flow-status matrix", () => {
  assert.deepEqual(
    [...objectiveFlowStatuses].sort(),
    Object.keys(objectiveFlowPolicy).sort(),
  );

  for (const flowStatus of objectiveFlowStatuses) {
    const item = objective({ flowStatus });
    const expected = lifecycleExpectations[flowStatus];

    assert.equal(objectiveFlowPolicyFor(item), objectiveFlowPolicy[flowStatus], `${flowStatus}: policy lookup`);
    assert.equal(objectiveFlowLabel(item), expected.label, `${flowStatus}: label`);
    assert.equal(objectiveFlowTone(item), expected.tone, `${flowStatus}: tone`);
    assert.equal(objectiveChallengeSortRank(item), expected.sortRank, `${flowStatus}: sort rank`);
    assert.equal(
      objectiveChallengeSortRank(item, { hasChallengers: true }),
      expected.assignedSortRank ?? expected.sortRank,
      `${flowStatus}: assigned sort rank`,
    );

    assert.equal(canPublishObjectiveByFlow(item), expected.publish, `${flowStatus}: publish`);
    assert.equal(canApplyForObjectiveChallenge(item), expected.apply, `${flowStatus}: apply`);
    assert.equal(canReviewObjectiveChallengeApplications(item), expected.reviewApplications, `${flowStatus}: review applications`);
    assert.equal(canRecruitObjectiveChallengersByFlow(item), expected.recruit, `${flowStatus}: recruit`);
    assert.equal(canAcceptObjectiveChallengeByFlow(item), expected.acceptChallenge, `${flowStatus}: accept challenge`);
    assert.equal(canMutateObjectiveResultsByFlow(item), expected.mutateResults, `${flowStatus}: mutate results`);
    assert.equal(canMutateObjectiveWorkItemsByFlow(item), expected.mutateWorkItems, `${flowStatus}: mutate work items`);
    assert.equal(canMutateObjectiveCommentsByFlow(item), expected.mutateComments, `${flowStatus}: mutate comments`);
    assert.equal(canMutateObjectiveCommentsAsChallengerByFlow(item), expected.mutateCommentsAsChallenger, `${flowStatus}: challenger comments`);
    assert.equal(canDeleteObjectiveByFlow(item), expected.deleteObjective, `${flowStatus}: delete`);
    assert.equal(canFreezeObjectiveByFlow(item), expected.freeze, `${flowStatus}: freeze`);
    assert.equal(canSubmitObjectiveLootByFlow(item), expected.submitLoot, `${flowStatus}: submit loot`);
    assert.equal(canSubmitObjectiveContributionReviewByFlow(item), expected.submitContributionReview, `${flowStatus}: contribution review`);
    assert.equal(canReviewObjectiveLootByFlow(item), expected.reviewLoot, `${flowStatus}: review loot`);
    assert.equal(isObjectiveChallengeDiscoverableByFlow(item), expected.discoverable, `${flowStatus}: discoverable`);
    assert.equal(isObjectiveChallengeAcceptedByFlow(item), expected.accepted, `${flowStatus}: accepted`);
    assert.equal(isObjectiveChallengeEntryClosedByFlow(item), expected.entryClosed, `${flowStatus}: entry closed`);
    assert.equal(isObjectiveReestimatingByFlow(item), flowStatus === "reestimating", `${flowStatus}: reestimating`);
    assert.equal(isObjectiveResultLockedByFlow(item), expected.resultLocked, `${flowStatus}: result lock`);
    assert.equal(shouldRenderObjectiveAsFrozen(item), expected.frozenRender, `${flowStatus}: frozen render`);
    assert.equal(isObjectiveSubmittedByFlow(item), expected.submitted, `${flowStatus}: submitted`);
    assert.equal(isObjectiveSettledOrClosed(item), expected.settledOrClosed, `${flowStatus}: settled or closed`);
  }

  assert.equal(isObjectiveResultLockedByFlow(undefined), true, "missing objective locks result editing");
  assert.equal(canApplyForObjectiveChallenge(undefined), false, "missing objective never accepts challenge application");
});

test("objective stage compatibility is derived from lifecycle policy", () => {
  const stages: OrfStage[] = ["goalSetting", "resultClaiming", "orfReestimate", "goalFrozen"];

  for (const flowStatus of objectiveFlowStatuses) {
    const allowed = new Set(stageCompatibility[flowStatus]);
    for (const stage of stages) {
      assert.equal(
        isObjectiveStageCompatibleWithFlowStatus(flowStatus, stage),
        allowed.has(stage),
        `${flowStatus}: ${stage}`,
      );
    }
  }

  assert.equal(
    isObjectiveStageCompatibleWithFlowStatus(
      objectiveLifecycleInitialState.flowStatus,
      objectiveLifecycleInitialState.stage,
    ),
    true,
  );
});

test("objective lifecycle transitions centralize flow-status changes", () => {
  assert.deepEqual(objectiveLifecycleTransitions.publishCandidate, {
    from: "candidate",
    to: "open",
    stage: "resultClaiming",
  });
  assert.deepEqual(objectiveLifecycleTransitions.acceptChallenge, {
    to: "reestimating",
    stage: "orfReestimate",
  });
  assert.deepEqual(objectiveLifecycleTransitions.freezeAfterReestimate, {
    from: "reestimating",
    to: "frozen",
    stage: "goalFrozen",
  });

  assert.equal(objectiveFlowStatusAfterChallengeApplication("open"), "applying");
  assert.equal(objectiveFlowStatusAfterChallengeApplication("recruiting"), "recruiting");
  assert.equal(
    objectiveFlowStatusAfterChallengeApplicationReview({
      hasAcceptedChallengers: true,
      hasAssignedChallengers: false,
      hasPendingApplications: false,
    }),
    "reestimating",
  );
  assert.equal(
    objectiveFlowStatusAfterChallengeApplicationReview({
      hasAcceptedChallengers: false,
      hasAssignedChallengers: true,
      hasPendingApplications: false,
    }),
    "recruiting",
  );
  assert.equal(
    objectiveFlowStatusAfterChallengeApplicationReview({
      hasAcceptedChallengers: false,
      hasAssignedChallengers: false,
      hasPendingApplications: true,
    }),
    "applying",
  );
  assert.equal(
    objectiveFlowStatusAfterChallengeApplicationReview({
      hasAcceptedChallengers: false,
      hasAssignedChallengers: false,
      hasPendingApplications: false,
    }),
    "open",
  );
  assert.equal(
    objectiveFlowStatusAfterRecruitment({
      currentFlowStatus: "open",
      hasAcceptedChallengers: false,
    }),
    "recruiting",
  );
  assert.equal(
    objectiveFlowStatusAfterRecruitment({
      currentFlowStatus: "reestimating",
      hasAcceptedChallengers: false,
    }),
    "reestimating",
  );
});

test("objective reestimate window requires reestimating flow and non-expired due time", () => {
  const now = new Date("2026-05-28T12:00:00.000Z");

  assert.equal(isObjectiveReestimateDueAtOpen(null, now), true);
  assert.equal(isObjectiveReestimateDueAtOpen("2026-05-28T12:00:00.000Z", now), true);
  assert.equal(isObjectiveReestimateDueAtOpen("2026-05-28T11:59:59.999Z", now), false);
  assert.equal(isObjectiveReestimateDueAtOpen("not-a-date", now), false);
  assert.equal(isObjectiveReestimateWindowOpen(objective({ flowStatus: "reestimating", confirmationDueAt: null }), now), true);
  assert.equal(
    isObjectiveReestimateWindowOpen(objective({ flowStatus: "reestimating", confirmationDueAt: "2026-05-28T11:59:59.999Z" }), now),
    false,
  );
  assert.equal(isObjectiveReestimateWindowOpen(objective({ flowStatus: "frozen", confirmationDueAt: null }), now), false);
});

function objective(overrides: Partial<Objective> = {}): Objective {
  return {
    id: "obj-a",
    title: "Objective",
    description: "Objective description",
    whyItMatters: "It matters",
    cycle: "2026-Q2",
    stage: "resultClaiming",
    flowStatus: "open",
    status: "Draft",
    confidence: 50,
    progress: 0,
    boundary: "Boundary",
    successDefinition: "Success",
    resultIds: [],
    feedbackIds: [],
    taskIds: [],
    finalDueAt: "2026-06-30",
    challengers: [],
    assignedChallengers: [],
    challengeApplications: [],
    acceptedAt: null,
    confirmationDueAt: null,
    confirmedAt: null,
    lootSubmittedAt: null,
    acceptedResult: null,
    completionMultiplier: null,
    objectiveBasePoints: 0,
    objectiveSettlementPoints: null,
    createdAt: "2026-05-14",
    updatedAt: "2026-05-14",
    ...overrides,
  };
}
