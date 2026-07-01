import type { ObjectiveFlowStatus, WorkLogObjectiveSelectionAvailability } from "../../types/orf";
import { isObjectiveAcceptedByFlow, isObjectiveSettledOrClosed, objectiveFlowStatuses } from "../orfLifecycle";

type WorkLogPermissionUser = {
  name?: string | null;
  role?: string | null;
};

type WorkLogObjectiveTarget =
  | { flowStatus: ObjectiveFlowStatus }
  | ObjectiveFlowStatus
  | null
  | undefined;

export const unscopedWorkLogMemberNameList = ["邓滨虎", "何永杰"] as const;
export const workLogObjectiveDefaultFlowStatuses = objectiveFlowStatuses.filter(
  (flowStatus) => !isObjectiveAcceptedByFlow(flowStatus) && !isObjectiveSettledOrClosed(flowStatus),
);
export const workLogObjectiveCompletedSearchFlowStatuses = [
  "accepted",
  "settled",
] as const satisfies readonly ObjectiveFlowStatus[];
export const workLogObjectiveSearchOnlyFlowStatuses = objectiveFlowStatuses.filter(
  (flowStatus) => !workLogObjectiveDefaultFlowStatuses.includes(flowStatus),
);
export const workLogObjectiveSelectionCandidateFlowStatuses = [
  ...workLogObjectiveDefaultFlowStatuses,
  ...workLogObjectiveSearchOnlyFlowStatuses,
] as const satisfies readonly ObjectiveFlowStatus[];
export const workLogObjectiveAlwaysSelectableFlowStatuses = workLogObjectiveDefaultFlowStatuses;

const unscopedWorkLogMemberNames = new Set<string>(unscopedWorkLogMemberNameList);
const workLogObjectiveDefaultFlowStatusSet = new Set<ObjectiveFlowStatus>(workLogObjectiveDefaultFlowStatuses);
const workLogObjectiveSearchOnlyFlowStatusSet = new Set<ObjectiveFlowStatus>(workLogObjectiveSearchOnlyFlowStatuses);

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

function objectiveFlowStatusForWorkLog(target: WorkLogObjectiveTarget) {
  return typeof target === "string" ? target : target?.flowStatus;
}

export function isObjectiveCompletedForWorkLog(target: WorkLogObjectiveTarget) {
  const flowStatus = objectiveFlowStatusForWorkLog(target);
  if (!flowStatus) return false;
  return isObjectiveAcceptedByFlow(flowStatus) || isObjectiveSettledOrClosed(flowStatus);
}

export function workLogObjectiveSelectionAvailability(
  target: WorkLogObjectiveTarget,
): WorkLogObjectiveSelectionAvailability | null {
  const flowStatus = objectiveFlowStatusForWorkLog(target);
  if (!flowStatus) return null;
  if (workLogObjectiveDefaultFlowStatusSet.has(flowStatus)) return "default";
  if (workLogObjectiveSearchOnlyFlowStatusSet.has(flowStatus)) return "searchOnly";
  return null;
}

export function canShowObjectiveInDefaultWorkLogList(target: WorkLogObjectiveTarget) {
  return workLogObjectiveSelectionAvailability(target) === "default";
}

export function canAttachObjectiveToWorkLog(target: WorkLogObjectiveTarget) {
  return workLogObjectiveSelectionAvailability(target) !== null;
}

export function canSelectObjectiveForWorkLog(target: WorkLogObjectiveTarget) {
  return canAttachObjectiveToWorkLog(target);
}

export function isWorkLogSearchOnlyObjective(target: WorkLogObjectiveTarget) {
  return workLogObjectiveSelectionAvailability(target) === "searchOnly";
}
