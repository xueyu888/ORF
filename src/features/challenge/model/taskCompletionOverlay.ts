import type { OrfState, Task } from "../../../types/orf";
import { localDateString } from "../../../utils/date";

export type TaskCompletionOverlayInput =
  | { type: "task"; taskId: string; done: boolean }
  | { type: "subtask"; taskId: string; itemId: string; done: boolean };
export type TaskCompletionOverlay = TaskCompletionOverlayInput & { id: string };

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
    return setTaskCompletion(state, overlay.taskId, overlay.done);
  }

  return updateTaskChecklistItem(state, overlay.taskId, overlay.itemId, overlay.done);
}

function sameCompletionState(left: Task, right: Task) {
  if (left.status !== right.status || left.checklist.length !== right.checklist.length) return false;

  return left.checklist.every((leftItem) => {
    const rightItem = right.checklist.find((item) => item.id === leftItem.id);
    return rightItem?.done === leftItem.done;
  });
}

function currentDate() {
  return localDateString(new Date());
}

function taskStatusForChecklist(checklist: Task["checklist"], fallback: Task["status"]): Task["status"] {
  if (checklist.length === 0) {
    return fallback === "Done" ? "Todo" : fallback;
  }

  const completedCount = checklist.filter((item) => item.done).length;
  return completedCount === checklist.length ? "Done" : completedCount > 0 ? "In Progress" : "Todo";
}

function setTaskCompletion(state: OrfState, taskId: string, done: boolean): OrfState {
  const now = currentDate();

  return {
    ...state,
    tasks: state.tasks.map((task) =>
      task.id === taskId
        ? {
            ...task,
            status: done ? "Done" : "Todo",
            checklist: task.checklist.map((item) => ({ ...item, done, updatedAt: now })),
            updatedAt: now,
          }
        : task,
    ),
  };
}

function updateTaskChecklistItem(state: OrfState, taskId: string, itemId: string, done: boolean): OrfState {
  const now = currentDate();

  return {
    ...state,
    tasks: state.tasks.map((task) => {
      if (task.id !== taskId) {
        return task;
      }

      if (!task.checklist.some((item) => item.id === itemId)) {
        return task;
      }

      const checklist = task.checklist.map((item) => (item.id === itemId ? { ...item, done, updatedAt: now } : item));

      return {
        ...task,
        status: taskStatusForChecklist(checklist, task.status),
        checklist,
        updatedAt: now,
      };
    }),
  };
}
