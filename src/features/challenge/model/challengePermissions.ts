import type { OrfStage, OrfState, PermissionAction, PermissionResource, UserRole } from "../../../types/orf";
import type { ChallengeTarget, DragItem } from "./types";

const defaultStage: OrfStage = "orfReestimate";

export function objectiveStage(state: OrfState, objectiveId: string) {
  return state.objectives.find((objective) => objective.id === objectiveId)?.stage ?? defaultStage;
}

export function actionStage(state: OrfState, actionId: string) {
  const action = state.tasks.find((item) => item.id === actionId);
  return objectiveStage(state, action?.linkedObjectiveId ?? "");
}

export function targetStage(state: OrfState, target: ChallengeTarget) {
  return objectiveStage(state, target.type === "objective" ? target.id : target.objectiveId);
}

export function dragItemStage(state: OrfState, item: DragItem) {
  return item.type === "subAction" ? actionStage(state, item.actionId) : objectiveStage(state, item.objectiveId);
}

export function canAccess(state: OrfState, role: UserRole | undefined, stage: OrfStage, action: PermissionAction, resource: PermissionResource) {
  if (role === "admin") {
    return true;
  }

  return state.permissionRules.some((rule) => rule.role === role && rule.stage === stage && rule.resource === resource && rule.actions.includes(action));
}

export function canAccessTarget(state: OrfState, role: UserRole | undefined, target: ChallengeTarget, action: PermissionAction) {
  return canAccess(state, role, targetStage(state, target), action, resourceForTarget(target));
}

export function canAccessDragItem(state: OrfState, role: UserRole | undefined, item: DragItem, action: PermissionAction) {
  return canAccess(state, role, dragItemStage(state, item), action, resourceForDragItem(item));
}

export function resourceForTarget(target: ChallengeTarget): PermissionResource {
  if (target.type === "objective") return "objective";
  if (target.type === "bounty") return "result";
  if (target.type === "action") return "task";
  return "subtask";
}

export function resourceForDragItem(item: DragItem): PermissionResource {
  if (item.type === "bounty") return "result";
  if (item.type === "action") return "task";
  return "subtask";
}

export function permissionDeniedMessage(action: PermissionAction, resource: PermissionResource) {
  const resourceLabel: Record<PermissionResource, string> = {
    objective: "目标",
    result: "悬赏",
    task: "行动项",
    subtask: "子行动项",
  };
  const actionLabel: Record<PermissionAction, string> = {
    create: "创建",
    delete: "删除",
    edit: "编辑",
    view: "查看",
  };

  return `没有${actionLabel[action]}${resourceLabel[resource]}权限`;
}
