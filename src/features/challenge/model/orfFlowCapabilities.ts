import { hasPermission } from "../../../config/permissions";
import type {
  Objective,
  ObjectiveContributionReview,
  OrfUser,
  PermissionRule,
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

const objectiveResultLockedStatuses = new Set([
  "frozen",
  "submitted",
  "settled",
  "closed",
]);

const objectiveRecruitableStatuses = new Set([
  "open",
  "applying",
  "recruiting",
  "reestimating",
]);

const objectiveWorkItemMutationStatuses = new Set([
  "reestimating",
  "frozen",
]);

export const objectiveSettlementStatuses = new Set(["settled", "closed"]);

export function isObjectiveResultLocked(objective: Objective | undefined): boolean {
  if (!objective) return true;
  return (
    objectiveResultLockedStatuses.has(objective.flowStatus) ||
    Boolean(objective.acceptedResult)
  );
}

export function isObjectiveRecruitable(objective: Objective): boolean {
  return (
    objectiveRecruitableStatuses.has(objective.flowStatus) &&
    !objectiveSettlementStatuses.has(objective.flowStatus) &&
    !objective.acceptedResult
  );
}

export function isReestimateWindowOpen(
  objective: Objective,
  now = new Date(),
): boolean {
  if (objective.flowStatus !== "reestimating") {
    return false;
  }

  if (!objective.confirmationDueAt) {
    return true;
  }

  const dueAt = new Date(objective.confirmationDueAt).getTime();
  return Number.isFinite(dueAt) && now.getTime() <= dueAt;
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
  return Boolean(objective && objectiveWorkItemMutationStatuses.has(objective.flowStatus));
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
      objective.flowStatus === "frozen" &&
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
      objective.flowStatus === "submitted" &&
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
    objective && currentUser?.role === "admin" && objective.flowStatus === "submitted",
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
