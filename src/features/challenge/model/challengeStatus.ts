import type { AutomaticCompletionResult, Objective, Result, Task, TaskChecklistItem, TaskStatus, UncertaintyLevel } from "../../../types/orf";
import type { ActionVisualStatus, BountyStatus } from "./types";

const difficultyRank: Record<UncertaintyLevel, number> = {
  入门: 1,
  进阶: 2,
  破局: 3,
  渡劫: 4,
  飞升: 5,
};

export const bountyStatusLabel: Record<BountyStatus, string> = {
  open: "可申请",
  active: "挑战中",
  review: "待验收",
  settled: "已结算",
};

export function bountyStatus(result: Result, actions: Task[], completed?: 0 | 1, lootSubmitted = false): BountyStatus {
  if (completed === 1 || actions.some((action) => action.status === "Done")) return "settled";
  if (lootSubmitted || actions.some((action) => action.status === "In Review")) return "review";
  if (result.owner) return "active";
  return "open";
}

export function bountyDifficulty(result: Result) {
  return result.uncertaintyLevel ? `${difficultyRank[result.uncertaintyLevel]} 星` : "2 星";
}

export function objectiveComplete(objective: Objective, automaticCompletion?: AutomaticCompletionResult) {
  return automaticCompletion?.goal === 1 || objective.progress >= 100;
}

export function objectiveStatusLabel(objective: Objective, automaticCompletion?: AutomaticCompletionResult) {
  if (objectiveComplete(objective, automaticCompletion)) return "已完成";
  if (objective.status === "At Risk" || objective.status === "Blocked") return "有风险";
  return "正常";
}

export function objectiveStatusTone(objective: Objective, automaticCompletion?: AutomaticCompletionResult) {
  if (objectiveComplete(objective, automaticCompletion)) return "done";
  if (objective.status === "At Risk" || objective.status === "Blocked") return "warning";
  return "success";
}

export function actionVisualStatus(action: Task, automaticCompletion?: AutomaticCompletionResult): ActionVisualStatus {
  const automaticTaskCompletion = automaticCompletion?.tasks?.[action.id];
  if (automaticTaskCompletion !== undefined) {
    return automaticTaskCompletion === 1 ? "done" : "todo";
  }

  return taskStatusToVisualStatus(action.status);
}

export function subActionVisualStatus(action: Task, item: TaskChecklistItem, itemIndex: number): ActionVisualStatus {
  if (item.done) return "done";
  if (taskStatusToVisualStatus(action.status) === "active" && firstIncompleteChecklistIndex(action) === itemIndex) return "active";
  return "todo";
}

export function taskStatusToVisualStatus(status: TaskStatus): ActionVisualStatus {
  if (status === "Done") return "done";
  if (status === "In Progress" || status === "In Review") return "active";
  return "todo";
}

function firstIncompleteChecklistIndex(action: Task) {
  return action.checklist.findIndex((item) => !item.done);
}
