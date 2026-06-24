import type { ObjectiveFlowStatus, OrfStage } from "../../types/orf";
import { objectiveFlowPolicy } from "./policy";

export const objectiveLifecycleInitialState = {
  flowStatus: "candidate",
  stage: "orfReestimate",
} as const satisfies {
  readonly flowStatus: ObjectiveFlowStatus;
  readonly stage: OrfStage;
};

export const objectiveLifecycleTransitions = {
  publishCandidate: {
    from: "candidate",
    to: "open",
    stage: "resultClaiming",
  },
  acceptChallenge: {
    to: "reestimating",
    stage: "orfReestimate",
  },
  freezeAfterReestimate: {
    from: "reestimating",
    to: "frozen",
    stage: "goalFrozen",
  },
  reopenFrozenReestimate: {
    from: "frozen",
    to: "reestimating",
    stage: "orfReestimate",
  },
  submitLoot: {
    from: "frozen",
    to: "submitted",
  },
  resubmitLoot: {
    from: "revisionRequired",
    to: "submitted",
  },
  requireRevision: {
    from: "submitted",
    to: "revisionRequired",
    stage: "goalFrozen",
  },
  acceptLoot: {
    from: "submitted",
    to: "accepted",
    stage: "goalFrozen",
  },
  settleLoot: {
    from: "accepted",
    to: "settled",
    stage: "goalFrozen",
  },
} as const satisfies Record<
  string,
  {
    readonly from?: ObjectiveFlowStatus;
    readonly to: ObjectiveFlowStatus;
    readonly stage?: OrfStage;
  }
>;

export function isObjectiveStageCompatibleWithFlowStatus(flowStatus: ObjectiveFlowStatus, stage: OrfStage): boolean {
  const compatibleStages: readonly OrfStage[] = objectiveFlowPolicy[flowStatus].compatibleStages;
  return compatibleStages.includes(stage);
}

export function objectiveFlowStatusAfterChallengeApplication(flowStatus: ObjectiveFlowStatus): ObjectiveFlowStatus {
  if (flowStatus === "open" || flowStatus === "applying") return "applying";
  if (flowStatus === "recruiting" || flowStatus === "reestimating") return flowStatus;
  return flowStatus;
}

export function objectiveFlowStatusAfterChallengeApplicationReview(input: {
  hasAcceptedChallengers: boolean;
  hasAssignedChallengers: boolean;
  hasPendingApplications: boolean;
}): ObjectiveFlowStatus {
  if (input.hasAcceptedChallengers) return "reestimating";
  if (input.hasAssignedChallengers) return "recruiting";
  if (input.hasPendingApplications) return "applying";
  return "open";
}

export function objectiveFlowStatusAfterRecruitment(input: {
  currentFlowStatus: ObjectiveFlowStatus;
  hasAcceptedChallengers: boolean;
}): ObjectiveFlowStatus {
  return input.hasAcceptedChallengers || input.currentFlowStatus === "reestimating"
    ? "reestimating"
    : "recruiting";
}
