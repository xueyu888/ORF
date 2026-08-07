import type {
  FeedbackImpact,
  FeedbackPriority,
  FeedbackRelationType,
  FeedbackResolution,
  FeedbackStage,
} from "@orf/feedback-module/contracts";
import type { EvidenceType, Impact, Priority, TaskStatus, WorkStatus } from "../types/orf";

export const workStatusLabel: Record<WorkStatus, string> = {
  "On Track": "正常",
  "At Risk": "有风险",
  Blocked: "阻塞",
  Draft: "草稿",
};

export const feedbackStageLabel: Record<FeedbackStage, string> = {
  open: "打开",
  in_progress: "处理中",
  pending_verification: "待验证",
  closed: "已关闭",
};

export const feedbackResolutionLabel: Record<FeedbackResolution, string> = {
  resolved: "已解决",
  not_needed: "无需解决",
  cannot_resolve: "无法解决",
  duplicate: "重复反馈",
  unspecified: "历史关闭",
};

export const taskStatusLabel: Record<TaskStatus, string> = {
  Backlog: "待整理",
  Todo: "待办",
  "In Progress": "进行中",
  "In Review": "评审中",
  Done: "已完成",
};

export const priorityLabel: Record<Priority, string> = {
  Low: "低",
  Medium: "中",
  High: "高",
  Critical: "紧急",
};

export const impactLabel: Record<Impact, string> = {
  Low: "低",
  Medium: "中",
  High: "高",
  Critical: "严重",
};

export const feedbackImpactLabel: Record<FeedbackImpact, string> = {
  low: "低",
  medium: "中",
  high: "高",
  critical: "严重",
};

export const feedbackPriorityLabel: Record<FeedbackPriority, string> = {
  p0: "P0",
  p1: "P1",
  p2: "P2",
  p3: "P3",
};

export const feedbackRelationTypeLabel: Record<FeedbackRelationType, string> = {
  related: "相关",
  duplicates: "重复",
  blocks: "阻塞",
};

export function feedbackLifecycleLabel(input: {
  resolution: FeedbackResolution | null;
  stage: FeedbackStage;
}) {
  if (input.stage === "closed" && input.resolution) return feedbackResolutionLabel[input.resolution];
  if (input.stage === "pending_verification" && input.resolution) {
    return `待验证：${feedbackResolutionLabel[input.resolution]}`;
  }
  return feedbackStageLabel[input.stage];
}

export const evidenceTypeLabel: Record<EvidenceType, string> = {
  "Eval run": "评估运行",
  "Log sample": "日志样本",
  "User report": "用户反馈",
  "Dashboard snapshot": "仪表盘快照",
  "Incident report": "事故报告",
};

export function statusLabel(status: WorkStatus | TaskStatus | Priority | Impact): string {
  return (
    workStatusLabel[status as WorkStatus] ??
    taskStatusLabel[status as TaskStatus] ??
    priorityLabel[status as Priority] ??
    impactLabel[status as Impact] ??
    status
  );
}

export const commandTypeLabel: Record<string, string> = {
  Action: "动作",
  Feedback: "反馈",
  Metric: "指标",
  Objective: "目标",
  Page: "页面",
  Subtask: "子任务",
  Task: "行动项",
};
