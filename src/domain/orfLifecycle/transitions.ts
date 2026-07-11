import type { ObjectiveFlowStatus, OrfStage } from "../../types/orf";

const objectiveStageByFlowStatus = {
  candidate: "goalSetting",
  open: "resultClaiming",
  applying: "resultClaiming",
  recruiting: "resultClaiming",
  reestimating: "orfReestimate",
  frozen: "goalFrozen",
  submitted: "goalFrozen",
  revisionRequired: "goalFrozen",
  accepted: "goalFrozen",
  settled: "goalFrozen",
  closed: "goalFrozen",
} as const satisfies Record<ObjectiveFlowStatus, OrfStage>;

export function objectiveStageForFlowStatus(flowStatus: ObjectiveFlowStatus): OrfStage {
  return objectiveStageByFlowStatus[flowStatus];
}

export const objectiveLifecycleInitialState = {
  flowStatus: "candidate",
} as const satisfies {
  readonly flowStatus: ObjectiveFlowStatus;
};

export const objectiveLifecycleTransitions = {
  publishCandidate: {
    from: "candidate",
    to: "open",
  },
  acceptChallenge: {
    to: "reestimating",
  },
  freezeAfterReestimate: {
    from: "reestimating",
    to: "frozen",
  },
  reopenFrozenReestimate: {
    from: "frozen",
    to: "reestimating",
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
  },
  acceptLoot: {
    from: "submitted",
    to: "accepted",
  },
  settleLoot: {
    from: "accepted",
    to: "settled",
  },
} as const satisfies Record<
  string,
  {
    readonly from?: ObjectiveFlowStatus;
    readonly to: ObjectiveFlowStatus;
  }
>;

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
