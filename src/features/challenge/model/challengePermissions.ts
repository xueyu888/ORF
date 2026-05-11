import { hasRolePermission, permissionDefinitions, type PermissionKey } from "../../../config/permissions";
import type { OrfState, UserRole } from "../../../types/orf";
import type { ChallengeTarget, DragItem } from "./types";

type ChallengePermissionAction = "create" | "delete" | "edit";
type ChallengePermissionResource = "objective" | "result" | "task" | "subtask";

const permissionLabelByKey = new Map(permissionDefinitions.map((item) => [item.key, item.label]));

export function permissionKeyForChallengeAction(resource: ChallengePermissionResource, action: ChallengePermissionAction): PermissionKey | null {
  if (resource === "objective") {
    if (action === "create") return "objective.create";
    if (action === "edit") return "objective.edit";
    if (action === "delete") return "objective.delete";
  }

  if (resource === "result") {
    if (action === "create") return "result.create";
    if (action === "edit") return "result.edit";
    if (action === "delete") return "result.delete";
  }

  if (resource === "task" && action === "delete") {
    return "task.delete";
  }

  if (resource === "subtask" && action === "delete") {
    return "subtask.delete";
  }

  return null;
}

export function canUsePermission(state: OrfState, role: UserRole | undefined, key: PermissionKey) {
  return hasRolePermission(role, state.permissionRules, key);
}

export function canAccessTarget(state: OrfState, role: UserRole | undefined, target: ChallengeTarget, action: ChallengePermissionAction) {
  const key = permissionKeyForChallengeAction(resourceForTarget(target), action);
  return key ? canUsePermission(state, role, key) : true;
}

export function canAccessDragItem(state: OrfState, role: UserRole | undefined, item: DragItem) {
  const key = permissionKeyForChallengeAction(resourceForDragItem(item), "edit");
  return key ? canUsePermission(state, role, key) : true;
}

export function resourceForTarget(target: ChallengeTarget): ChallengePermissionResource {
  if (target.type === "objective") return "objective";
  if (target.type === "bounty") return "result";
  if (target.type === "action") return "task";
  return "subtask";
}

export function resourceForDragItem(item: DragItem): ChallengePermissionResource {
  if (item.type === "bounty") return "result";
  if (item.type === "action") return "task";
  return "subtask";
}

export function permissionDeniedMessage(key: PermissionKey) {
  return `没有${permissionLabelByKey.get(key) ?? key}权限`;
}
