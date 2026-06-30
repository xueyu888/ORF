import type { ObjectiveFlowStatus } from "../../types/orf";
import { isObjectiveAcceptedByFlow, isObjectiveSettledOrClosed, objectiveFlowStatuses } from "../orfLifecycle";

type WorkLogPermissionUser = {
  name?: string | null;
  role?: string | null;
};

type WorkLogObjectiveTarget = { flowStatus: ObjectiveFlowStatus } | ObjectiveFlowStatus | null | undefined;

export const unscopedWorkLogMemberNameList = ["邓滨虎", "何永杰"] as const;
export const workLogObjectiveSelectableFlowStatuses = objectiveFlowStatuses.filter(
  (flowStatus) => !isObjectiveCompletedForWorkLog(flowStatus),
);

const unscopedWorkLogMemberNames = new Set<string>(unscopedWorkLogMemberNameList);
const workLogObjectiveSelectableFlowStatusSet = new Set<ObjectiveFlowStatus>(workLogObjectiveSelectableFlowStatuses);

function normalizedUserName(name: string | null | undefined) {
  return name?.trim() ?? "";
}

export function canUseWorkLogCategories(user: WorkLogPermissionUser | null | undefined) {
  return user?.role === "admin";
}

export function canSaveUnscopedWorkLog(user: WorkLogPermissionUser | null | undefined) {
  if (user?.role === "admin") return true;
  return user?.role === "member" && unscopedWorkLogMemberNames.has(normalizedUserName(user.name));
}

export function requiresObjectiveProgressEstimate(user: WorkLogPermissionUser | null | undefined) {
  return user?.role === "member" && !canSaveUnscopedWorkLog(user);
}

export function isObjectiveCompletedForWorkLog(target: WorkLogObjectiveTarget) {
  return isObjectiveAcceptedByFlow(target) || isObjectiveSettledOrClosed(target);
}

export function canSelectObjectiveForWorkLog(target: WorkLogObjectiveTarget) {
  const flowStatus = typeof target === "string" ? target : target?.flowStatus;
  return Boolean(flowStatus && workLogObjectiveSelectableFlowStatusSet.has(flowStatus));
}
