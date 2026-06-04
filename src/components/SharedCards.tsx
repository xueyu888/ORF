import type { ElementType } from "react";
import { Card, ConfidenceBadge, ProgressBar, StatusBadge } from "./ui";
import type { Feedback, Objective, Result } from "../types/orf";

export function MetricCard({ title, value, delta, icon: Icon }: { title: string; value: string; delta: string; icon: ElementType }) {
  return (
    <Card interactive className="orf-card-padding">
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
  const description = objective.description.trim() || "目标规划待完善";

  return (
    <Card className="h-full orf-card-padding">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold orf-text-primary">{objective.title}</div>
          <p className="mt-2 line-clamp-2 text-sm orf-text-secondary">{description}</p>
        </div>
        <StatusBadge status={objective.status} />
      </div>
      <div className="mt-4 flex items-center justify-between">
        <div className="text-xs orf-text-secondary">{objective.cycle}</div>
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
  );
}

export function FeedbackCard({ feedback }: { feedback: Feedback }) {
  return (
    <Card className="orf-card-padding">
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm font-medium orf-text-primary">{feedback.phenomenon}</div>
        <StatusBadge status={feedback.status} />
      </div>
      <div className="mt-3 flex flex-wrap gap-1">
        {feedback.causeCategories.map((cause) => <span key={cause} className="orf-status-tag border orf-border orf-surface-muted px-2 py-0.5 text-xs orf-text-secondary">{cause}</span>)}
      </div>
      <div className="mt-3 text-xs orf-text-muted">处理人：<span className="orf-text-secondary">{feedback.owner}</span></div>
      <div className="mt-3 text-xs orf-text-secondary">{feedback.suggestedAdjustment}</div>
    </Card>
  );
}

export function DecisionLog({ decisions }: { decisions: { title: string; owner: string; date: string; reason?: string }[] }) {
  return (
    <Card className="orf-card-padding">
      <div className="mb-3 text-sm font-semibold orf-text-primary">决策记录</div>
      <div className="grid gap-3">
        {decisions.map((decision) => (
          <div key={`${decision.title}-${decision.date}`} className="rounded-md border orf-border orf-surface-muted p-3">
            <div className="text-sm orf-text-primary">{decision.title}</div>
            {decision.reason && <div className="mt-1 line-clamp-2 text-xs orf-text-muted">{decision.reason}</div>}
            <div className="mt-2 text-xs orf-text-muted">{decision.date} · {decision.owner}</div>
          </div>
        ))}
        {decisions.length === 0 && <div className="rounded-md border orf-border orf-surface-muted p-3 text-sm orf-text-muted">暂无决策记录。</div>}
      </div>
    </Card>
  );
}
