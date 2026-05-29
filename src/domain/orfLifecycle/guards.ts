import type { Objective } from "../../types/orf";
import type { ObjectiveFlowPolicy, ObjectiveLifecycleTarget } from "./types";
import { objectiveFlowPolicyFor, objectiveFlowStatusOf } from "./policy";

type ReestimateWindowTarget = Pick<Objective, "confirmationDueAt" | "flowStatus"> | null | undefined;
type ObjectiveFlowPolicyFlag = {
  [Key in keyof ObjectiveFlowPolicy]-?: ObjectiveFlowPolicy[Key] extends boolean ? Key : never;
}[keyof ObjectiveFlowPolicy];

function policyFlag(target: ObjectiveLifecycleTarget, flag: ObjectiveFlowPolicyFlag): boolean {
  return Boolean(objectiveFlowPolicyFor(target)?.[flag]);
}

export function canPublishObjectiveByFlow(target: ObjectiveLifecycleTarget): boolean {
  return policyFlag(target, "canPublish");
}

export function canApplyForObjectiveChallenge(target: ObjectiveLifecycleTarget): boolean {
  return policyFlag(target, "canApplyForChallenge");
}

export function canReviewObjectiveChallengeApplications(target: ObjectiveLifecycleTarget): boolean {
  return policyFlag(target, "canReviewChallengeApplications");
}

export function canRecruitObjectiveChallengersByFlow(target: ObjectiveLifecycleTarget): boolean {
  return policyFlag(target, "canRecruitChallengers");
}

export function canAcceptObjectiveChallengeByFlow(target: ObjectiveLifecycleTarget): boolean {
  return policyFlag(target, "canAcceptChallenge");
}

export function canMutateObjectiveResultsByFlow(target: ObjectiveLifecycleTarget): boolean {
  return policyFlag(target, "canMutateResults");
}

export function canMutateObjectiveWorkItemsByFlow(target: ObjectiveLifecycleTarget): boolean {
  return policyFlag(target, "canMutateWorkItems");
}

export function canMutateObjectiveCommentsByFlow(target: ObjectiveLifecycleTarget): boolean {
  return policyFlag(target, "canMutateComments");
}

export function canMutateObjectiveCommentsAsChallengerByFlow(target: ObjectiveLifecycleTarget): boolean {
  return policyFlag(target, "canMutateCommentsAsChallenger");
}

export function canDeleteObjectiveByFlow(target: ObjectiveLifecycleTarget): boolean {
  return policyFlag(target, "canDeleteObjective");
}

export function canFreezeObjectiveByFlow(target: ObjectiveLifecycleTarget): boolean {
  return policyFlag(target, "canFreezeAfterReestimate");
}

export function isObjectiveReestimatingByFlow(target: ObjectiveLifecycleTarget): boolean {
  return objectiveFlowStatusOf(target) === "reestimating";
}

export function canSubmitObjectiveLootByFlow(target: ObjectiveLifecycleTarget): boolean {
  return policyFlag(target, "canSubmitLoot");
}

export function canSubmitObjectiveContributionReviewByFlow(target: ObjectiveLifecycleTarget): boolean {
  return policyFlag(target, "canSubmitContributionReview");
}

export function canReviewObjectiveLootByFlow(target: ObjectiveLifecycleTarget): boolean {
  return policyFlag(target, "canReviewLoot");
}

export function isObjectiveChallengeDiscoverableByFlow(target: ObjectiveLifecycleTarget): boolean {
  return policyFlag(target, "challengeDiscoverable");
}

export function isObjectiveChallengeAcceptedByFlow(target: ObjectiveLifecycleTarget): boolean {
  return policyFlag(target, "challengeAccepted");
}

export function isObjectiveChallengeEntryClosedByFlow(target: ObjectiveLifecycleTarget): boolean {
  return policyFlag(target, "challengeEntryClosed");
}

export function isObjectiveResultLockedByFlow(target: ObjectiveLifecycleTarget): boolean {
  return !target || policyFlag(target, "resultLocked");
}

export function isObjectiveSubmittedByFlow(target: ObjectiveLifecycleTarget): boolean {
  return policyFlag(target, "submitted");
}

export function isObjectiveSettledOrClosed(target: ObjectiveLifecycleTarget): boolean {
  return policyFlag(target, "settledOrClosed");
}

export function shouldRenderObjectiveAsFrozen(target: ObjectiveLifecycleTarget): boolean {
  return policyFlag(target, "rendersAsFrozen");
}

export function isObjectiveReestimateDueAtOpen(value: string | null | undefined, now = new Date()): boolean {
  if (!value) return true;
  const dueTime = new Date(value).getTime();
  return Number.isFinite(dueTime) && now.getTime() <= dueTime;
}

export function isObjectiveReestimateWindowOpen(target: ReestimateWindowTarget, now = new Date()): boolean {
  return Boolean(
    target &&
      isObjectiveReestimatingByFlow(target) &&
      isObjectiveReestimateDueAtOpen(target.confirmationDueAt, now),
  );
}
