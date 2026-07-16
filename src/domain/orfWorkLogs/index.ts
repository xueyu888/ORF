import type {
  ObjectiveFlowStatus,
  WorkLogCategoryOption,
  WorkLogClassificationKind,
  WorkLogClassificationSuggestion,
  WorkLogObjectiveSelectionAvailability,
} from "../../types/orf";
import { isObjectiveAcceptedByFlow, isObjectiveSettledOrClosed, objectiveFlowStatuses } from "../orfLifecycle";

type WorkLogPermissionUser = {
  name?: string | null;
  role?: string | null;
  status?: string | null;
};

type WorkLogObjectiveTarget =
  | { flowStatus: ObjectiveFlowStatus }
  | ObjectiveFlowStatus
  | null
  | undefined;

type WorkLogBuiltInCategoryPolicy = {
  id: string;
  name: string;
  audience: "allWritableUsers";
};

type WorkLogUnscopedPolicy = {
  memberNames: readonly string[];
};

export type WorkLogClassificationSelection = {
  kind: WorkLogClassificationKind;
  targetId: string | null;
  targetName: string;
};

export const unscopedWorkLogMemberNameList = ["邓滨虎", "何永杰"] as const;
export const workLogBuiltInCategoryPolicies = [
  {
    id: "builtin:leave",
    name: "请假",
    audience: "allWritableUsers",
  },
] as const satisfies readonly WorkLogBuiltInCategoryPolicy[];
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

const workLogUnscopedPolicy: WorkLogUnscopedPolicy = {
  memberNames: unscopedWorkLogMemberNameList,
};
const unscopedWorkLogMemberNames = new Set<string>(workLogUnscopedPolicy.memberNames);
const workLogObjectiveDefaultFlowStatusSet = new Set<ObjectiveFlowStatus>(workLogObjectiveDefaultFlowStatuses);
const workLogObjectiveSearchOnlyFlowStatusSet = new Set<ObjectiveFlowStatus>(workLogObjectiveSearchOnlyFlowStatuses);
const workLogBuiltInCategoriesById = new Map<string, WorkLogBuiltInCategoryPolicy>(
  workLogBuiltInCategoryPolicies.map((category) => [category.id, category]),
);

function normalizedUserName(name: string | null | undefined) {
  return name?.trim() ?? "";
}

function normalizedCategoryName(value: string | null | undefined) {
  return value?.replace(/\s+/g, " ").trim().toLocaleLowerCase() ?? "";
}

export function doesWorkLogClassificationSuggestionMatch(
  suggestion: WorkLogClassificationSuggestion,
  selected: WorkLogClassificationSelection,
) {
  if (suggestion.kind === "objective") {
    return selected.kind === "objective" && selected.targetId === suggestion.objectiveId;
  }
  if (suggestion.kind === "category") {
    return selected.kind === "category" && selected.targetId === suggestion.categoryId;
  }
  if (suggestion.kind === "newCategory") {
    return selected.kind === "category" &&
      normalizedCategoryName(selected.targetName) === normalizedCategoryName(suggestion.categoryName);
  }
  return selected.kind === "uncategorized";
}

function canWriteWorkLog(user: WorkLogPermissionUser | null | undefined) {
  if (!user) return false;
  if (user.status && user.status !== "active") return false;
  return user.role === "admin" || user.role === "member";
}

function canUseBuiltInWorkLogCategoryPolicy(
  user: WorkLogPermissionUser | null | undefined,
  policy: WorkLogBuiltInCategoryPolicy,
) {
  if (policy.audience === "allWritableUsers") return canWriteWorkLog(user);
  return false;
}

export function canUseWorkLogCategories(user: WorkLogPermissionUser | null | undefined) {
  return user?.role === "admin";
}

export function canUseAllWorkLogObjectiveOptions(user: WorkLogPermissionUser | null | undefined) {
  return user?.role === "admin";
}

export function listBuiltInWorkLogCategoryOptions(user: WorkLogPermissionUser | null | undefined): WorkLogCategoryOption[] {
  return workLogBuiltInCategoryPolicies
    .filter((policy) => canUseBuiltInWorkLogCategoryPolicy(user, policy))
    .map((policy) => ({
      id: policy.id,
      name: policy.name,
      source: "builtIn" as const,
    }));
}

export function findBuiltInWorkLogCategoryForInput(
  user: WorkLogPermissionUser | null | undefined,
  input: { categoryId?: string | null; categoryName?: string | null },
) {
  const categoryById = input.categoryId ? workLogBuiltInCategoriesById.get(input.categoryId) : undefined;
  const categoryByName = input.categoryId
    ? undefined
    : workLogBuiltInCategoryPolicies.find(
        (policy) => normalizedCategoryName(policy.name) === normalizedCategoryName(input.categoryName),
      );
  const category = categoryById ?? categoryByName ?? null;
  if (!category || !canUseBuiltInWorkLogCategoryPolicy(user, category)) return null;
  return category;
}

export function canUseWorkLogCategoryInput(
  user: WorkLogPermissionUser | null | undefined,
  input: { categoryId?: string | null; categoryName?: string | null },
) {
  if (!input.categoryId && !input.categoryName) return true;
  if (findBuiltInWorkLogCategoryForInput(user, input)) return true;
  return canUseWorkLogCategories(user);
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
