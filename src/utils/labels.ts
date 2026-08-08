import type { EvidenceType, Impact, Priority, TaskStatus, WorkStatus } from "../types/orf";

export const workStatusLabel: Record<WorkStatus, string> = {
  "On Track": "正常",
  "At Risk": "有风险",
  Blocked: "阻塞",
  Draft: "草稿",
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
