import { OrfFlowStore } from "../../../state/OrfFlowStore";
import type { OrfState, Task } from "../../../types/orf";

export type TaskCompletionOverlayInput =
  | { type: "task"; taskId: string; done: boolean }
  | { type: "subtask"; taskId: string; itemId: string; done: boolean };
export type TaskCompletionOverlay = TaskCompletionOverlayInput & { id: string };

const completionStore = new OrfFlowStore();

export function taskCompletionOverlayKey(overlay: TaskCompletionOverlay) {
  return overlay.type === "task" ? `task:${overlay.taskId}` : `subtask:${overlay.taskId}:${overlay.itemId}`;
}

export function upsertTaskCompletionOverlay(overlays: TaskCompletionOverlay[], overlay: TaskCompletionOverlay) {
  const key = taskCompletionOverlayKey(overlay);
  return [...overlays.filter((item) => taskCompletionOverlayKey(item) !== key), overlay];
}

export function applyTaskCompletionOverlays(state: OrfState, overlays: TaskCompletionOverlay[]): OrfState {
  return overlays.reduce(applyTaskCompletionOverlay, state);
}

export function taskCompletionOverlayMaterialized(state: OrfState, overlay: TaskCompletionOverlay) {
  const currentTask = state.tasks.find((task) => task.id === overlay.taskId);
  if (!currentTask) return false;
  if (overlay.type === "subtask" && !currentTask.checklist.some((item) => item.id === overlay.itemId)) return false;

  const expectedTask = applyTaskCompletionOverlay(state, overlay).tasks.find((task) => task.id === overlay.taskId);
  return Boolean(expectedTask && sameCompletionState(currentTask, expectedTask));
}

function applyTaskCompletionOverlay(state: OrfState, overlay: TaskCompletionOverlay): OrfState {
  if (overlay.type === "task") {
    return completionStore.setTaskCompletion(state, overlay.taskId, overlay.done);
  }

  return completionStore.updateTaskChecklistItem(state, overlay.taskId, overlay.itemId, overlay.done);
}

function sameCompletionState(left: Task, right: Task) {
  if (left.status !== right.status || left.checklist.length !== right.checklist.length) return false;

  return left.checklist.every((leftItem) => {
    const rightItem = right.checklist.find((item) => item.id === leftItem.id);
    return rightItem?.done === leftItem.done;
  });
}
