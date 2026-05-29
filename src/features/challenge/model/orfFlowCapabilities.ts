import { hasPermission } from "../../../config/permissions";
import {
  canFreezeObjectiveByFlow,
  canMutateObjectiveWorkItemsByFlow,
  canRecruitObjectiveChallengersByFlow,
  canReviewObjectiveLootByFlow,
  canSubmitObjectiveContributionReviewByFlow,
  canSubmitObjectiveLootByFlow,
  isObjectiveReestimateWindowOpen,
  isObjectiveResultLockedByFlow,
  isObjectiveSettledOrClosed,
} from "../../../domain/orfLifecycle";
import type {
  Objective,
  ObjectiveContributionReview,
  OrfUser,
  PermissionRule,
  Result,
} from "../../../types/orf";

type MetricCreationAction = {
  label: string;
  source: "managerDefined" | "memberProposed";
};

type WorkbenchAction = {
  kind: "submitLoot" | "submitPeerReview" | "reviewLoot";
  label: string;
  to: string;
};

export function isObjectiveResultLocked(objective: Objective | undefined): boolean {
  return isObjectiveResultLockedByFlow(objective) || Boolean(objective?.acceptedResult);
}

export function isObjectiveRecruitable(objective: Objective): boolean {
  return (
    canRecruitObjectiveChallengersByFlow(objective) &&
    !isObjectiveSettledOrClosed(objective) &&
    !objective.acceptedResult
  );
}

export function isReestimateWindowOpen(
  objective: Objective,
  now = new Date(),
): boolean {
  return isObjectiveReestimateWindowOpen(objective, now);
}

export function canProposeObjectiveMetric(
  objective: Objective,
  memberName?: string | null,
  now = new Date(),
): boolean {
  return Boolean(
    memberName &&
      objective.challengers.includes(memberName) &&
      isReestimateWindowOpen(objective, now),
  );
}

export function canMutateObjectiveWorkItems(objective: Objective | undefined): boolean {
  return canMutateObjectiveWorkItemsByFlow(objective);
}

export function canFreezeObjectiveAfterReestimate(
  objective: Objective | undefined,
  results: readonly Pick<Result, "objectiveId">[],
): boolean {
  return Boolean(
    objective &&
      canFreezeObjectiveByFlow(objective) &&
      results.some((result) => result.objectiveId === objective.id),
  );
}

export function metricCreationActionForObjective({
  objective,
  currentUser,
  permissionRules,
  now = new Date(),
}: {
  objective: Objective;
  currentUser: OrfUser | null;
  permissionRules: PermissionRule[];
  now?: Date;
}): MetricCreationAction | null {
  if (
    hasPermission(currentUser, permissionRules, "result.create") &&
    !isObjectiveResultLocked(objective)
  ) {
    return { label: "新增指标", source: "managerDefined" };
  }

  if (canProposeObjectiveMetric(objective, currentUser?.name, now)) {
    return { label: "提出指标", source: "memberProposed" };
  }

  return null;
}

export function canRecruitObjectiveChallengers({
  objective,
  currentUser,
  permissionRules,
}: {
  objective: Objective;
  currentUser: OrfUser | null;
  permissionRules: PermissionRule[];
}): boolean {
  return (
    hasPermission(currentUser, permissionRules, "challenge.assign") &&
    isObjectiveRecruitable(objective)
  );
}

export function canSubmitObjectiveLoot(
  objective: Objective | undefined,
  currentUser: OrfUser | null,
): boolean {
  return Boolean(
    objective &&
      currentUser &&
      currentUser.role === "member" &&
      canSubmitObjectiveLootByFlow(objective) &&
      objective.challengers.includes(currentUser.name),
  );
}

export function canSubmitObjectivePeerReview(
  objective: Objective | undefined,
  currentUser: OrfUser | null,
): boolean {
  return Boolean(
    objective &&
      currentUser &&
      currentUser.role === "member" &&
      canSubmitObjectiveContributionReviewByFlow(objective) &&
      objective.challengers.includes(currentUser.name),
  );
}

export function hasSubmittedObjectivePeerReview({
  objectiveId,
  currentUser,
  contributionReviews,
}: {
  objectiveId: string;
  currentUser: OrfUser | null;
  contributionReviews: ObjectiveContributionReview[];
}): boolean {
  return Boolean(
    currentUser &&
      contributionReviews.some(
        (review) =>
          review.objectiveId === objectiveId &&
          review.reviewer === currentUser.name,
      ),
  );
}

export function canReviewObjectiveLoot(
  objective: Objective | undefined,
  currentUser: OrfUser | null,
): boolean {
  return Boolean(
    objective && currentUser?.role === "admin" && canReviewObjectiveLootByFlow(objective),
  );
}

export function workbenchActionForObjective({
  objective,
  currentUser,
  contributionReviews,
}: {
  objective: Objective;
  currentUser: OrfUser | null;
  contributionReviews: ObjectiveContributionReview[];
}): WorkbenchAction | null {
  if (canReviewObjectiveLoot(objective, currentUser)) {
    return {
      kind: "reviewLoot",
      label: "验收战利品",
      to: `/objectives/${objective.id}/loot`,
    };
  }

  if (canSubmitObjectiveLoot(objective, currentUser)) {
    return {
      kind: "submitLoot",
      label: "提交战利品",
      to: `/objectives/${objective.id}/loot`,
    };
  }

  if (canSubmitObjectivePeerReview(objective, currentUser)) {
    return {
      kind: "submitPeerReview",
      label: hasSubmittedObjectivePeerReview({
        objectiveId: objective.id,
        currentUser,
        contributionReviews,
      })
        ? "更新匿名互评"
        : "提交匿名互评",
      to: `/objectives/${objective.id}/loot`,
    };
  }

  return null;
}

export function resultDetailCapabilities({
  objective,
  currentUser,
  permissionRules,
}: {
  objective: Objective | undefined;
  currentUser: OrfUser | null;
  permissionRules: PermissionRule[];
}) {
  const canEditResult = hasPermission(currentUser, permissionRules, "result.edit");
  const isAssignedChallenger = Boolean(
    objective &&
      currentUser &&
      objective.challengers.includes(currentUser.name),
  );

  return {
    canSubmitLoot: canSubmitObjectiveLoot(objective, currentUser),
    canCreateTask: canMutateObjectiveWorkItems(objective) && (canEditResult || isAssignedChallenger),
    canProposeUpdate: canEditResult && !isObjectiveResultLocked(objective),
    canEditConfidence: canEditResult && !isObjectiveResultLocked(objective),
  };
}
