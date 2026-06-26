import type { Objective, Result, Task, TaskChecklistItem, TaskStatus } from "../../../types/orf";
import {
  isObjectiveAcceptedByFlow,
  isObjectiveChallengeAcceptedByFlow,
  isObjectiveSubmittedByFlow,
  isObjectiveSettledOrClosed,
  objectiveFlowLabel,
  objectiveFlowTone,
} from "../../../domain/orfLifecycle";
import type { ActionVisualStatus, BountyStatus } from "./types";

export const bountyStatusLabel: Record<BountyStatus, string> = {
  open: "可申请",
  active: "挑战中",
  review: "待验收",
  accepted: "已验收",
  settled: "已结算",
};

export function bountyStatus(result: Result, objective?: Objective): BountyStatus {
  if (objective) {
    if (isObjectiveSettledOrClosed(objective)) return "settled";
    if (isObjectiveAcceptedByFlow(objective)) return "accepted";
    if (isObjectiveSubmittedByFlow(objective)) return "review";
    if (isObjectiveChallengeAcceptedByFlow(objective)) return "active";
    return "open";
  }
  if (result.acceptedResult === "completed" || result.acceptedResult === "falsified") return "settled";
  return "open";
}

export function bountyDifficulty(result: Result) {
  return result.uncertaintyLevel ?? "待校准";
}

export function objectiveComplete(objective: Objective) {
  return isObjectiveSettledOrClosed(objective) &&
    (objective.acceptedResult === "completed" ||
      objective.acceptedResult === "falsified" ||
      objective.acceptedResult === "overdelivered");
}

export function objectiveStatusLabel(objective: Objective) {
  const flowLabel = objectiveFlowLabel(objective);
  if (flowLabel) return flowLabel;
  if (objectiveComplete(objective)) return "已完成";
  if (objective.status === "At Risk" || objective.status === "Blocked") return "有风险";
  return "正常";
}

export function objectiveStatusTone(objective: Objective) {
  if (objectiveComplete(objective)) return "done";
  const flowTone = objectiveFlowTone(objective);
  if (flowTone) return flowTone;
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
