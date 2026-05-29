import type { Objective, ObjectiveFlowStatus, OrfStage } from "../../types/orf";

export type ObjectiveLifecycleTarget = Pick<Objective, "flowStatus"> | ObjectiveFlowStatus | null | undefined;

export type ObjectiveLifecyclePhase =
  | "planning"
  | "discoverable"
  | "forming"
  | "active"
  | "review"
  | "settled"
  | "closed";

export type ObjectiveLifecycleTone = "open" | "active" | "review" | "done";

export type ObjectiveFlowPolicy = {
  readonly label: string;
  readonly phase: ObjectiveLifecyclePhase;
  readonly tone: ObjectiveLifecycleTone;
  readonly compatibleStages: readonly OrfStage[];
  readonly challengeSortRank: number;
  readonly assignedChallengeSortRank?: number;
  readonly canPublish: boolean;
  readonly canApplyForChallenge: boolean;
  readonly canReviewChallengeApplications: boolean;
  readonly canRecruitChallengers: boolean;
  readonly canAcceptChallenge: boolean;
  readonly canMutateResults: boolean;
  readonly canMutateWorkItems: boolean;
  readonly canMutateComments: boolean;
  readonly canMutateCommentsAsChallenger: boolean;
  readonly canDeleteObjective: boolean;
  readonly canFreezeAfterReestimate: boolean;
  readonly canSubmitLoot: boolean;
  readonly canSubmitContributionReview: boolean;
  readonly canReviewLoot: boolean;
  readonly challengeDiscoverable: boolean;
  readonly challengeAccepted: boolean;
  readonly challengeEntryClosed: boolean;
  readonly resultLocked: boolean;
  readonly rendersAsFrozen: boolean;
  readonly submitted: boolean;
  readonly settledOrClosed: boolean;
};
