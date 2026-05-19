import type { Objective, ObjectiveFlowStatus } from "../types/orf";

export const objectiveChallengeApplicationFlowStatuses = new Set<ObjectiveFlowStatus>([
  "open",
  "applying",
  "recruiting",
]);

export const objectiveApplicationReviewFlowStatuses = new Set<ObjectiveFlowStatus>([
  "applying",
  "recruiting",
  "reestimating",
]);

export const objectiveRecruitmentFlowStatuses = new Set<ObjectiveFlowStatus>([
  "open",
  "applying",
  "recruiting",
  "reestimating",
]);

export const objectiveResultLockedFlowStatuses = new Set<ObjectiveFlowStatus>([
  "frozen",
  "submitted",
  "settled",
  "closed",
]);

export const objectiveSettlementFlowStatuses = new Set<ObjectiveFlowStatus>([
  "settled",
  "closed",
]);

export const objectiveGoalFrozenFlowStatuses = new Set<ObjectiveFlowStatus>([
  "frozen",
  "submitted",
  "settled",
  "closed",
]);

export function canApplyForObjectiveChallenge(objective: Objective | null | undefined): boolean {
  return Boolean(objective && objectiveChallengeApplicationFlowStatuses.has(objective.flowStatus));
}

export function canReviewObjectiveChallengeApplications(objective: Objective | null | undefined): boolean {
  return Boolean(objective && objectiveApplicationReviewFlowStatuses.has(objective.flowStatus));
}

export function canRecruitObjectiveChallengersByFlow(objective: Objective | null | undefined): boolean {
  return Boolean(objective && objectiveRecruitmentFlowStatuses.has(objective.flowStatus));
}

export function isObjectiveResultLockedByFlow(objective: Objective | null | undefined): boolean {
  return !objective || objectiveResultLockedFlowStatuses.has(objective.flowStatus);
}

export function isObjectiveSettledOrClosed(objective: Objective | null | undefined): boolean {
  return Boolean(objective && objectiveSettlementFlowStatuses.has(objective.flowStatus));
}

export function shouldRenderObjectiveAsFrozen(objective: Objective | null | undefined): boolean {
  return Boolean(objective && objectiveGoalFrozenFlowStatuses.has(objective.flowStatus));
}
