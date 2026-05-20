import type { EvidenceType, FeedbackStatus, Impact, Priority, TaskStatus, WorkStatus } from "../types/orf";

export const workStatusLabel: Record<WorkStatus, string> = {
  "On Track": "正常",
  "At Risk": "有风险",
  Blocked: "阻塞",
  Draft: "草稿",
};

export const feedbackStatusLabel: Record<FeedbackStatus, string> = {
  New: "新反馈",
  Reviewing: "评审中",
  "Action Created": "已建动作",
  "Result Updated": "已更新指标",
  Closed: "已关闭",
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

export const evidenceTypeLabel: Record<EvidenceType, string> = {
  "Eval run": "评估运行",
  "Log sample": "日志样本",
  "User report": "用户反馈",
  "Dashboard snapshot": "仪表盘快照",
  "Incident report": "事故报告",
};

export function statusLabel(status: WorkStatus | FeedbackStatus | TaskStatus | Priority | Impact): string {
  return (
    workStatusLabel[status as WorkStatus] ??
    feedbackStatusLabel[status as FeedbackStatus] ??
    taskStatusLabel[status as TaskStatus] ??
    priorityLabel[status as Priority] ??
    impactLabel[status as Impact] ??
    status
  );
}

export const commandTypeLabel: Record<string, string> = {
  Action: "动作",
  Page: "页面",
  Objective: "目标",
  Result: "指标",
  Task: "行动项",
  Feedback: "反馈",
};
