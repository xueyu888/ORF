import { hasPermission } from "../../../config/permissions";
import { canReviewObjectiveTrialReview, latestObjectiveTrialReview } from "../../../domain/orfTrialReview";
import {
  canFreezeObjectiveAfterReestimate,
  canRecruitObjectiveChallengersByFlow,
  canReinforceObjectiveChallengersByFlow,
  canReviewObjectiveLootByFlow,
  canSettleObjectiveLootByFlow,
  canSubmitObjectiveContributionReviewByFlow,
  canSubmitObjectiveLootByFlow,
  isObjectiveReestimateWindowOpen,
  isObjectiveResultLockedByFlow,
  isObjectiveSettledOrClosed,
  type ObjectiveFreezeReadiness,
} from "../../../domain/orfLifecycle";
import { objectiveChallengeEntryClosed } from "../../../domain/orfChallengeEntry";
import {
  canMutateObjectiveWorkItemsForActor,
  objectiveWorkItemMutationAccess,
  type ObjectiveWorkItemMutationAccess,
} from "../../../domain/orfWorkItems";
import { canEditObjectiveContentForUser } from "../../../domain/orfObjectiveContent";
import { isObjectiveChallenger } from "../../../domain/orfObjectiveParticipants";
import type {
  Objective,
  ObjectiveTrialReview,
  OrfUser,
  PermissionRule,
} from "../../../types/orf";

export { canFreezeObjectiveAfterReestimate };

type MetricCreationAction = {
  label: string;
  source: "managerDefined" | "memberProposed";
};

export type MetricEditAccess =
  | { status: "allowed" }
  | { status: "blocked"; reason: "notFound" | "lifecycleLocked" | "forbidden" };

export type MetricLifecycleMutationAccess =
  | { status: "allowed" }
  | { status: "blocked"; reason: "notFound" | "lifecycleLocked" };

export type WorkItemMutationAccess = ObjectiveWorkItemMutationAccess;

type WorkbenchAction = {
  kind: "submitLoot" | "submitPeerReview" | "reviewLoot" | "settleLoot" | "reviewTrial";
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

export function isObjectiveReinforceable(objective: Objective): boolean {
  return (
    canReinforceObjectiveChallengersByFlow(objective) &&
    !objectiveChallengeEntryClosed(objective)
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
  memberUserId?: string | null,
  now = new Date(),
): boolean {
  return Boolean(
    memberUserId &&
      isObjectiveChallenger(objective, memberUserId) &&
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

export function canEditObjectiveContent(currentUser: OrfUser | null): boolean {
  return canEditObjectiveContentForUser(currentUser);
}

export function objectiveContentEditUnavailableMessage() {
  return "只有指挥官可以编辑目标";
}

export function metricLifecycleMutationAccessForObjective(
  objective: Objective | undefined,
): MetricLifecycleMutationAccess {
  if (!objective) return { status: "blocked", reason: "notFound" };
  if (isObjectiveResultLocked(objective)) return { status: "blocked", reason: "lifecycleLocked" };
  return { status: "allowed" };
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
  if (canProposeObjectiveMetric(objective, currentUser?.id, now)) return { status: "allowed" };
  return { status: "blocked", reason: "forbidden" };
}

export function metricEditUnavailableMessage(access: MetricEditAccess) {
  if (access.status === "allowed") return "";
  if (access.reason === "notFound") return "指标所属目标不可用";
  if (access.reason === "lifecycleLocked") return "指标已冻结，不能编辑";
  return "没有编辑指标权限";
}

export function objectiveFreezeUnavailableMessage(readiness: ObjectiveFreezeReadiness) {
  if (readiness.status === "ready") return "";
  if (readiness.reason === "missingResults") return "目标至少需要一个已校准指标后才能冻结";
  if (readiness.reason === "uncalibratedResults") return "请先校准目标下所有指标积分，再完成对齐冻结";
  if (readiness.reason === "lifecycleLocked") return "目标当前阶段不能冻结";
  return "目标不可用，无法冻结";
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

  if (canProposeObjectiveMetric(objective, currentUser?.id, now)) {
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

export function canReinforceObjectiveChallengers({
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
    isObjectiveReinforceable(objective)
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
      (objective.challengerUserIds ?? []).includes(currentUser.id),
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
      (objective.challengerUserIds ?? []).includes(currentUser.id),
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

export function canSettleObjectiveLoot(
  objective: Objective | undefined,
  currentUser: OrfUser | null,
): boolean {
  return Boolean(
    objective && currentUser?.role === "admin" && canSettleObjectiveLootByFlow(objective),
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

  if (canSettleObjectiveLoot(objective, currentUser)) {
    return {
      kind: "settleLoot",
      label: "去结算",
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
