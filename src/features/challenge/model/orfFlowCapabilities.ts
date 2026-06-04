import { hasPermission } from "../../../config/permissions";
import { canReviewObjectiveTrialReview, latestObjectiveTrialReview } from "../../../domain/orfTrialReview";
import { hasUncalibratedResultPoints } from "../../../domain/orfSettlement";
import {
  canFreezeObjectiveByFlow,
  canRecruitObjectiveChallengersByFlow,
  canReviewObjectiveLootByFlow,
  canSubmitObjectiveContributionReviewByFlow,
  canSubmitObjectiveLootByFlow,
  isObjectiveReestimateWindowOpen,
  isObjectiveResultLockedByFlow,
  isObjectiveSettledOrClosed,
} from "../../../domain/orfLifecycle";
import {
  canMutateObjectiveWorkItemsForActor,
  objectiveWorkItemMutationAccess,
  type ObjectiveWorkItemMutationAccess,
} from "../../../domain/orfWorkItems";
import type {
  Objective,
  ObjectiveTrialReview,
  OrfUser,
  PermissionRule,
  Result,
} from "../../../types/orf";

type MetricCreationAction = {
  label: string;
  source: "managerDefined" | "memberProposed";
};

export type MetricEditAccess =
  | { status: "allowed" }
  | { status: "blocked"; reason: "notFound" | "lifecycleLocked" | "forbidden" };

export type WorkItemMutationAccess = ObjectiveWorkItemMutationAccess;

type WorkbenchAction = {
  kind: "submitLoot" | "submitPeerReview" | "reviewLoot" | "reviewTrial";
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

export function workItemMutationAccessForObjective({
  objective,
  currentUser,
}: {
  objective: Objective | undefined;
  currentUser: OrfUser | null;
}): WorkItemMutationAccess {
  return objectiveWorkItemMutationAccess(objective, currentUser);
}

export function canMutateObjectiveWorkItems(objective: Objective | undefined, currentUser: OrfUser | null): boolean {
  return canMutateObjectiveWorkItemsForActor(objective, currentUser);
}

export function workItemMutationUnavailableMessage(access: WorkItemMutationAccess) {
  if (access.status === "allowed") return "";
  if (access.reason === "notFound") return "行动项所属目标不可用";
  if (access.reason === "lifecycleLocked") return "目标当前阶段不能修改行动项";
  return "只有目标正式挑战者或指挥官可以修改行动项";
}

export function metricEditAccessForObjective({
  objective,
  currentUser,
  permissionRules,
  now = new Date(),
}: {
  objective: Objective | undefined;
  currentUser: OrfUser | null;
  permissionRules: PermissionRule[];
  now?: Date;
}): MetricEditAccess {
  if (!objective) return { status: "blocked", reason: "notFound" };
  if (isObjectiveResultLocked(objective)) return { status: "blocked", reason: "lifecycleLocked" };
  if (hasPermission(currentUser, permissionRules, "result.edit")) return { status: "allowed" };
  if (canProposeObjectiveMetric(objective, currentUser?.name, now)) return { status: "allowed" };
  return { status: "blocked", reason: "forbidden" };
}

export function metricEditUnavailableMessage(access: MetricEditAccess) {
  if (access.status === "allowed") return "";
  if (access.reason === "notFound") return "指标所属目标不可用";
  if (access.reason === "lifecycleLocked") return "指标已冻结，不能编辑";
  return "没有编辑指标权限";
}

export function canFreezeObjectiveAfterReestimate(
  objective: Objective | undefined,
  results: readonly Pick<Result, "objectiveId" | "uncertaintyLevel" | "uncertaintyScore">[],
): boolean {
  return Boolean(
    objective &&
      canFreezeObjectiveByFlow(objective) &&
      results.some((result) => result.objectiveId === objective.id) &&
      !hasUncalibratedResultPoints(results.filter((result) => result.objectiveId === objective.id)),
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
  trialReviews = [],
}: {
  objective: Objective;
  currentUser: OrfUser | null;
  trialReviews?: ObjectiveTrialReview[];
}): WorkbenchAction | null {
  const trialReview = latestObjectiveTrialReview(objective.id, trialReviews);
  if (canReviewObjectiveTrialReview(objective, currentUser, trialReview)) {
    return {
      kind: "reviewTrial",
      label: "处理试验收",
      to: `/tasks/objectives/${objective.id}/loot`,
    };
  }

  if (canReviewObjectiveLoot(objective, currentUser)) {
    return {
      kind: "reviewLoot",
      label: "验收战利品",
      to: `/tasks/objectives/${objective.id}/loot`,
    };
  }

  if (canSubmitObjectiveLoot(objective, currentUser)) {
    return {
      kind: "submitLoot",
      label: "提交战利品",
      to: `/tasks/objectives/${objective.id}/loot`,
    };
  }

  if (canSubmitObjectivePeerReview(objective, currentUser)) {
    return {
      kind: "submitPeerReview",
      label: "提交匿名互评",
      to: `/tasks/objectives/${objective.id}/loot`,
    };
  }

  return null;
}
