import type { ObjectiveFlowStatus } from "../../types/orf";
import { isObjectiveAcceptedByFlow, isObjectiveSettledOrClosed, objectiveFlowStatuses } from "../orfLifecycle";
import { localDateString } from "../../utils/date";

type WorkLogPermissionUser = {
  name?: string | null;
  role?: string | null;
};

type WorkLogObjectiveTarget =
  | { acceptedAt?: string | null; flowStatus: ObjectiveFlowStatus; settledAt?: string | null }
  | ObjectiveFlowStatus
  | null
  | undefined;
type WorkLogObjectiveSelectionContext = {
  workDate?: string | null;
};

export const unscopedWorkLogMemberNameList = ["邓滨虎", "何永杰"] as const;
export const workLogObjectiveAlwaysSelectableFlowStatuses = objectiveFlowStatuses.filter(
  (flowStatus) => !isObjectiveAcceptedByFlow(flowStatus) && !isObjectiveSettledOrClosed(flowStatus),
);
export const workLogObjectiveSelectionCandidateFlowStatuses = [
  ...workLogObjectiveAlwaysSelectableFlowStatuses,
  "accepted",
  "settled",
] as const satisfies readonly ObjectiveFlowStatus[];

const unscopedWorkLogMemberNames = new Set<string>(unscopedWorkLogMemberNameList);
const workLogObjectiveAlwaysSelectableFlowStatusSet = new Set<ObjectiveFlowStatus>(workLogObjectiveAlwaysSelectableFlowStatuses);

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

function acceptedAtForWorkLog(target: WorkLogObjectiveTarget) {
  return typeof target === "string" ? null : target?.acceptedAt ?? null;
}

function settledAtForWorkLog(target: WorkLogObjectiveTarget) {
  return typeof target === "string" ? null : target?.settledAt ?? null;
}

function timestampMatchesWorkDate(timestamp: string | null | undefined, workDate: string | null | undefined) {
  if (!timestamp || !workDate) return false;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return false;
  return localDateString(date) === workDate;
}

export function isObjectiveCompletedForWorkLog(
  target: WorkLogObjectiveTarget,
  context: WorkLogObjectiveSelectionContext = {},
) {
  const flowStatus = objectiveFlowStatusForWorkLog(target);
  if (!flowStatus) return false;
  if (isObjectiveAcceptedByFlow(flowStatus)) {
    return !timestampMatchesWorkDate(acceptedAtForWorkLog(target), context.workDate);
  }
  if (flowStatus === "settled") {
    return !timestampMatchesWorkDate(settledAtForWorkLog(target), context.workDate);
  }
  return isObjectiveSettledOrClosed(flowStatus);
}

export function canSelectObjectiveForWorkLog(
  target: WorkLogObjectiveTarget,
  context: WorkLogObjectiveSelectionContext = {},
) {
  const flowStatus = objectiveFlowStatusForWorkLog(target);
  if (!flowStatus) return false;
  if (workLogObjectiveAlwaysSelectableFlowStatusSet.has(flowStatus)) return true;
  return !isObjectiveCompletedForWorkLog(target, context);
}
