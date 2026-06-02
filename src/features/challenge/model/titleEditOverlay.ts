import type { OrfState } from "../../../types/orf";
import type { ChallengeTarget } from "./types";

export type TitleEditOverlayInput =
  | { type: "objective"; objectiveId: string; title: string }
  | { type: "metric"; resultId: string; title: string }
  | { type: "action"; taskId: string; title: string }
  | { type: "subtask"; taskId: string; itemId: string; title: string };

export type TitleEditOverlay = TitleEditOverlayInput & { id: string };

export function titleEditOverlayForTarget(target: ChallengeTarget, title: string): TitleEditOverlayInput {
  if (target.type === "objective") return { type: "objective", objectiveId: target.id, title };
  if (target.type === "bounty") return { type: "metric", resultId: target.id, title };
  if (target.type === "action") return { type: "action", taskId: target.id, title };
  return { type: "subtask", taskId: target.actionId, itemId: target.id, title };
}

export function titleEditOverlayKey(overlay: TitleEditOverlayInput) {
  if (overlay.type === "objective") return `objective:${overlay.objectiveId}`;
  if (overlay.type === "metric") return `metric:${overlay.resultId}`;
  if (overlay.type === "action") return `action:${overlay.taskId}`;
  return `subtask:${overlay.taskId}:${overlay.itemId}`;
}

export function upsertTitleEditOverlay(overlays: TitleEditOverlay[], overlay: TitleEditOverlay) {
  const key = titleEditOverlayKey(overlay);
  return [...overlays.filter((item) => titleEditOverlayKey(item) !== key), overlay];
}

export function applyTitleEditOverlays(state: OrfState, overlays: TitleEditOverlay[]): OrfState {
  return overlays.reduce(applyTitleEditOverlay, state);
}

export function titleEditOverlayResolved(state: OrfState, overlay: TitleEditOverlay) {
  if (overlay.type === "objective") {
    const objective = state.objectives.find((item) => item.id === overlay.objectiveId);
    return !objective || objective.title === overlay.title;
  }

  if (overlay.type === "metric") {
    const result = state.results.find((item) => item.id === overlay.resultId);
    return !result || result.title === overlay.title;
  }

  if (overlay.type === "action") {
    const task = state.tasks.find((item) => item.id === overlay.taskId);
    return !task || task.title === overlay.title;
  }

  const task = state.tasks.find((item) => item.id === overlay.taskId);
  const item = task?.checklist.find((current) => current.id === overlay.itemId);
  return !task || !item || item.label === overlay.title;
}

function applyTitleEditOverlay(state: OrfState, overlay: TitleEditOverlay): OrfState {
  if (overlay.type === "objective") {
    return {
      ...state,
      objectives: state.objectives.map((objective) => (objective.id === overlay.objectiveId ? { ...objective, title: overlay.title } : objective)),
    };
  }

  if (overlay.type === "metric") {
    return {
      ...state,
      results: state.results.map((result) => (result.id === overlay.resultId ? { ...result, title: overlay.title, metricName: overlay.title } : result)),
    };
  }

  if (overlay.type === "action") {
    return {
      ...state,
      tasks: state.tasks.map((task) => (task.id === overlay.taskId ? { ...task, title: overlay.title } : task)),
    };
  }

  return {
    ...state,
    tasks: state.tasks.map((task) =>
      task.id === overlay.taskId
        ? { ...task, checklist: task.checklist.map((item) => (item.id === overlay.itemId ? { ...item, label: overlay.title } : item)) }
        : task,
    ),
  };
}
