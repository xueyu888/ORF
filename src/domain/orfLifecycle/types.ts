import type { Objective, ObjectiveFlowStatus } from "../../types/orf";

export type ObjectiveLifecycleTarget = Pick<Objective, "flowStatus"> | ObjectiveFlowStatus | null | undefined;

export type ObjectiveLifecyclePhase =
  | "planning"
  | "discoverable"
  | "forming"
  | "active"
  | "review"
  | "accepted"
  | "settled"
  | "closed";

export type ObjectiveLifecycleTone = "open" | "active" | "review" | "done";

export type ObjectiveFlowPolicy = {
  readonly label: string;
  readonly phase: ObjectiveLifecyclePhase;
  readonly tone: ObjectiveLifecycleTone;
  readonly challengeSortRank: number;
  readonly assignedChallengeSortRank?: number;
  readonly canPublish: boolean;
  readonly canApplyForChallenge: boolean;
  readonly canReviewChallengeApplications: boolean;
  readonly canRecruitChallengers: boolean;
  readonly canReinforceChallengers: boolean;
  readonly canAcceptChallenge: boolean;
  readonly canMutateResults: boolean;
  readonly canMutateMetricExecutionCompletion: boolean;
  readonly canMutateWorkItems: boolean;
  readonly canMutateComments: boolean;
  readonly canMutateCommentsAsChallenger: boolean;
  readonly canDeleteObjective: boolean;
  readonly canFreezeAfterReestimate: boolean;
  readonly canSubmitLoot: boolean;
  readonly canSubmitContributionReview: boolean;
  readonly canReviewLoot: boolean;
  readonly challengeDiscoverable: boolean;
  readonly bountyHallVisible: boolean;
  readonly challengeAccepted: boolean;
  readonly challengeEntryClosed: boolean;
  readonly resultLocked: boolean;
  readonly rendersAsFrozen: boolean;
  readonly submitted: boolean;
  readonly accepted: boolean;
  readonly settledOrClosed: boolean;
  readonly canSettleLoot: boolean;
};
