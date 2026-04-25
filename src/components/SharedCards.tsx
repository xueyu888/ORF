import { Link } from "react-router-dom";
import { Activity, AlertTriangle, CheckCircle2, MessageSquare, Target } from "lucide-react";
import type { ElementType } from "react";
import { Card, ConfidenceBadge, ProgressBar, StatusBadge, Avatar } from "./ui";
import type { Feedback, Objective, Result, Task } from "../types/orf";
import { metricValue, resultProgress } from "../utils/format";
import { taskStatusLabel } from "../utils/labels";

export function MetricCard({ title, value, delta, icon: Icon }: { title: string; value: string; delta: string; icon: ElementType }) {
  return (
    <Card interactive className="p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm orf-text-secondary">{title}</div>
        <div className="rounded-md orf-surface-muted p-2 orf-accent-text"><Icon className="h-4 w-4" /></div>
      </div>
      <div className="mt-4 text-3xl font-semibold orf-text-primary">{value}</div>
      <div className="mt-2 text-xs orf-text-muted">{delta}</div>
    </Card>
  );
}

export function ObjectiveCard({ objective, results, feedback }: { objective: Objective; results: Result[]; feedback: Feedback[] }) {
  const onTrack = results.filter((result) => result.status === "On Track").length;
  const atRisk = results.filter((result) => result.status === "At Risk").length;
  const latestFeedback = feedback[0];

  return (
    <Link to={`/objectives/${objective.id}`}>
      <Card interactive className="h-full p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold orf-text-primary">{objective.title}</div>
            <p className="mt-2 line-clamp-2 text-sm orf-text-secondary">{objective.description}</p>
          </div>
          <StatusBadge status={objective.status} />
        </div>
        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center gap-2"><Avatar name={objective.owner} size="sm" /><span className="text-xs orf-text-secondary">{objective.owner}</span></div>
          <ConfidenceBadge value={objective.confidence} />
        </div>
        <div className="mt-4">
          <div className="mb-2 flex justify-between text-xs orf-text-muted"><span>进度</span><span>{objective.progress}%</span></div>
          <ProgressBar value={objective.progress} />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 text-xs orf-text-secondary">
          <div className="rounded-md orf-surface-muted p-2">正常 {onTrack}</div>
          <div className="rounded-md orf-surface-muted p-2">有风险 {atRisk}</div>
        </div>
        {latestFeedback && <div className="mt-3 rounded-md border orf-border orf-surface-muted p-2 text-xs orf-text-secondary">最新反馈：{latestFeedback.phenomenon}</div>}
      </Card>
    </Link>
  );
}

export function ResultCard({ result }: { result: Result }) {
  return (
    <Link to={`/objectives/${result.objectiveId}/results/${result.id}`}>
      <Card interactive className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="text-sm font-semibold orf-text-primary">{result.title}</div>
          <StatusBadge status={result.status} />
        </div>
        <div className="mt-3 text-xs orf-text-muted">{result.metricName}</div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
          <div><div className="orf-text-muted">基线</div><div className="mt-1 orf-text-primary">{metricValue(result.baseline, result.unit, result.direction)}</div></div>
          <div><div className="orf-text-muted">当前</div><div className="mt-1 orf-text-primary">{metricValue(result.current, result.unit, result.direction)}</div></div>
          <div><div className="orf-text-muted">目标</div><div className="mt-1 orf-text-primary">{metricValue(result.target, result.unit, result.direction)}</div></div>
        </div>
        <div className="mt-4"><ProgressBar value={resultProgress(result)} /></div>
        <div className="mt-4 flex items-center justify-between text-xs orf-text-muted">
          <span>{result.evidenceIds.length} 条证据</span>
          <span>{result.feedbackIds.length} 条反馈</span>
          <span>{result.taskIds.length} 个任务</span>
        </div>
      </Card>
    </Link>
  );
}

export function FeedbackCard({ feedback, resultTitle }: { feedback: Feedback; resultTitle?: string }) {
  return (
    <Link to={`/feedback/${feedback.id}`}>
      <Card interactive className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="text-sm font-medium orf-text-primary">{feedback.phenomenon}</div>
          <StatusBadge status={feedback.status} />
        </div>
        <div className="mt-3 flex flex-wrap gap-1">
          {feedback.causeCategories.map((cause) => <span key={cause} className="rounded-full border orf-border orf-surface-muted px-2 py-0.5 text-xs orf-text-secondary">{cause}</span>)}
        </div>
        <div className="mt-3 text-xs orf-text-muted">关联结果：<span className="orf-text-secondary">{resultTitle}</span></div>
        <div className="mt-3 text-xs orf-text-secondary">{feedback.suggestedAdjustment}</div>
      </Card>
    </Link>
  );
}

export function TaskRow({ task, resultTitle, onStatusChange }: { task: Task; resultTitle?: string; onStatusChange: (status: Task["status"]) => void }) {
  return (
    <div className="orf-table-row grid grid-cols-[78px_minmax(240px,1fr)_120px_88px_108px_112px] items-center gap-3 px-3 py-3 text-sm">
      <div className="font-mono text-xs orf-text-muted">{task.id}</div>
      <div className="min-w-0">
        <div className="truncate font-medium orf-text-primary">{task.title}</div>
        <div className="mt-1 truncate text-xs orf-text-muted">{resultTitle ? `支撑结果：${resultTitle}` : "未关联结果"}</div>
      </div>
      <select className="orf-input px-2 py-1 text-xs" value={task.status} onChange={(event) => onStatusChange(event.target.value as Task["status"])}>
        {["Backlog", "Todo", "In Progress", "In Review", "Done"].map((status) => <option key={status} value={status}>{taskStatusLabel[status as Task["status"]]}</option>)}
      </select>
      <StatusBadge status={task.priority} />
      <div className="text-xs orf-text-secondary">{task.assignee}</div>
      <div className="text-xs orf-text-muted">{task.dueDate}</div>
    </div>
  );
}

export function IntegrityCheck({ hasFeedback, hasTasks, resultRiskCount }: { hasFeedback: boolean; hasTasks: boolean; resultRiskCount: number }) {
  const items = [
    { label: "目标是结果导向", state: "通过" },
    { label: "结果可度量", state: resultRiskCount > 0 ? "提醒" : "通过" },
    { label: "本周有反馈更新", state: hasFeedback ? "通过" : "未通过" },
    { label: "任务已关联结果", state: hasTasks ? "通过" : "提醒" },
  ];

  return (
    <Card className="p-4">
      <div className="text-sm font-semibold orf-text-primary">ORF 完整性检查</div>
      <div className="mt-3 grid gap-2">
        {items.map((item) => (
          <div key={item.label} className="flex items-center justify-between rounded-md orf-surface-muted px-3 py-2 text-xs">
            <span className="orf-text-secondary">{item.label}</span>
            <span className={item.state === "通过" ? "orf-success-text" : item.state === "提醒" ? "orf-warning-text" : "orf-danger-text"}>{item.state}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function DecisionLog({ decisions }: { decisions: { title: string; owner: string; date: string; reason?: string }[] }) {
  return (
    <Card className="p-4">
      <div className="mb-3 text-sm font-semibold orf-text-primary">决策记录</div>
      <div className="grid gap-3">
        {decisions.map((decision) => (
          <div key={`${decision.title}-${decision.date}`} className="rounded-md border orf-border orf-surface-muted p-3">
            <div className="text-sm orf-text-primary">{decision.title}</div>
            {decision.reason && <div className="mt-1 line-clamp-2 text-xs orf-text-muted">{decision.reason}</div>}
            <div className="mt-2 text-xs orf-text-muted">{decision.date} · {decision.owner}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

export const iconMap = { Activity, AlertTriangle, CheckCircle2, MessageSquare, Target };
