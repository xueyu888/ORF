import type { Objective, Result, Task, TaskChecklistItem, TaskStatus, UncertaintyLevel } from "../../../types/orf";
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

export function bountyStatus(result: Result, objective?: Objective): BountyStatus {
  if (result.acceptedResult === "completed" || result.acceptedResult === "falsified") return "settled";
  if (objective?.flowStatus === "settled" || objective?.acceptedResult || objective?.objectiveSettlementPoints != null) return "settled";
  if (objective?.flowStatus === "submitted" || objective?.lootSubmittedAt) return "review";
  if (objective?.flowStatus === "reestimating" || objective?.flowStatus === "frozen" || (objective?.challengers.length ?? 0) > 0) return "active";
  return "open";
}

export function bountyDifficulty(result: Result) {
  return result.uncertaintyLevel ? `${difficultyRank[result.uncertaintyLevel]} 星` : "2 星";
}

export function objectiveComplete(objective: Objective) {
  return objective.acceptedResult === "completed" || objective.acceptedResult === "falsified" || objective.acceptedResult === "overdelivered";
}

export function objectiveStatusLabel(objective: Objective) {
  if (objective.flowStatus === "candidate") return "候选中";
  if (objective.flowStatus === "open") return "可申请";
  if (objective.flowStatus === "applying") return "申请中";
  if (objective.flowStatus === "recruiting") return "征召中";
  if (objective.flowStatus === "reestimating") return "重估中";
  if (objective.flowStatus === "frozen") return "已冻结";
  if (objective.flowStatus === "submitted") return "待验收";
  if (objective.flowStatus === "settled") return "已结算";
  if (objective.flowStatus === "closed") return "已关闭";
  if (objectiveComplete(objective)) return "已完成";
  if (objective.status === "At Risk" || objective.status === "Blocked") return "有风险";
  return "正常";
}

export function objectiveStatusTone(objective: Objective) {
  if (objective.flowStatus === "settled" || objectiveComplete(objective)) return "done";
  if (objective.flowStatus === "submitted" || objective.lootSubmittedAt) return "review";
  if (objective.flowStatus === "applying" || objective.flowStatus === "recruiting" || objective.flowStatus === "reestimating" || objective.flowStatus === "frozen") return "active";
  if (objective.flowStatus === "candidate" || objective.flowStatus === "closed") return "open";
  if (objective.status === "At Risk" || objective.status === "Blocked") return "warning";
  return "success";
}

export function actionVisualStatus(action: Task): ActionVisualStatus {
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
