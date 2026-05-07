import { MoreHorizontal, Plus } from "lucide-react";
import { useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";
import { ChartFrame } from "../components/ChartFrame";
import { PageScaffold } from "../components/PageScaffold";
import { DecisionLog, FeedbackCard, IntegrityCheck, ResultCard, TaskRow } from "../components/SharedCards";
import { Avatar, Button, Card, ConfidenceBadge, ProgressBar, StatusBadge } from "../components/ui";
import { useOrf } from "../state/OrfProvider";
import type { FeedbackStatus, TaskStatus } from "../types/orf";
import { feedbackStatusLabel } from "../utils/labels";

const tabs = ["Overview", "Results", "Tasks", "Feedback", "Decisions", "Evaluation"] as const;
const tabLabel: Record<(typeof tabs)[number], string> = {
  Overview: "概览",
  Results: "悬赏",
  Tasks: "行动项",
  Feedback: "反馈",
  Decisions: "决策",
  Evaluation: "评估",
};

export function ObjectiveDetailPage() {
  const { objectiveId } = useParams();
  const { state, openModal, updateTaskStatus, updateFeedbackStatus } = useOrf();
  const [tab, setTab] = useState<(typeof tabs)[number]>("Overview");
  const objective = state.objectives.find((item) => item.id === objectiveId);

  if (!objective) return <Navigate to="/objectives" replace />;

  const results = state.results.filter((result) => result.objectiveId === objective.id);
  const tasks = state.tasks.filter((task) => task.linkedObjectiveId === objective.id);
  const feedback = state.feedback.filter((item) => item.linkedObjectiveId === objective.id);
  const decisions = state.decisions.filter((decision) => decision.linkedObjectiveId === objective.id);
  const atRiskCount = results.filter((result) => result.status === "At Risk").length;

  return (
    <PageScaffold
      title={objective.title}
      subtitle={objective.description}
      action={<div className="flex gap-2"><Button variant="secondary" onClick={() => openModal({ type: "newResult", objectiveId: objective.id })}><Plus className="h-4 w-4" />新建悬赏</Button><Button onClick={() => openModal({ type: "newFeedback", objectiveId: objective.id })}>新建反馈</Button><Button variant="ghost"><MoreHorizontal className="h-4 w-4" /></Button></div>}
    >
      <Card className="orf-card-padding">
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge status={objective.status} />
          <div className="flex items-center gap-2"><Avatar name={objective.owner} size="sm" /><span className="text-sm orf-text-secondary">{objective.owner}</span></div>
          <span className="text-sm orf-text-muted">{objective.cycle}</span>
          <ConfidenceBadge value={objective.confidence} />
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_280px]">
          <div className="grid gap-3 text-sm orf-text-secondary">
            <p><span className="font-medium orf-text-primary">为什么重要：</span>{objective.whyItMatters}</p>
            <p><span className="font-medium orf-text-primary">边界 / 不做什么：</span>{objective.boundary}</p>
            <p><span className="font-medium orf-text-primary">成功定义：</span>{objective.successDefinition}</p>
          </div>
          <div>
            <div className="mb-2 flex justify-between text-xs orf-text-muted"><span>目标进度</span><span>{objective.progress}%</span></div>
            <ProgressBar value={objective.progress} />
            <div className="mt-3 text-xs orf-text-muted">最新反馈：{feedback[0]?.phenomenon ?? "本周暂无反馈。"}</div>
          </div>
        </div>
      </Card>

      <div className="flex gap-1 rounded-lg border orf-border orf-surface-muted p-1">
        {tabs.map((item) => <button key={item} onClick={() => setTab(item)} className={`rounded-md px-3 py-2 text-sm ${tab === item ? "orf-surface-muted orf-text-primary" : "orf-text-secondary orf-hover-text"}`}>{tabLabel[item]}</button>)}
      </div>

      {tab === "Overview" && (
        <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
          <div className="grid gap-4">
            <Card className="orf-card-padding">
              <div className="text-sm font-semibold orf-text-primary">进度概览</div>
              <div className="mt-4 grid gap-4 md:grid-cols-[1fr_2fr]">
                <div className="rounded-lg orf-surface-muted p-4">
                  <div className="text-xs orf-text-muted">信心趋势</div>
                  <div className="mt-2 text-3xl font-semibold orf-text-primary">{objective.confidence}%</div>
                  <div className="mt-4"><ProgressBar value={objective.progress} /></div>
                </div>
                <ChartFrame className="h-56 min-w-0">
                  {({ width, height }) => (
                    <LineChart width={width} height={height} data={results[0]?.trend ?? []}>
                      <XAxis dataKey="date" tick={{ fill: "var(--orf-text-muted)", fontSize: 11 }} />
                      <YAxis tick={{ fill: "var(--orf-text-muted)", fontSize: 11 }} />
                      <Tooltip contentStyle={{ background: "var(--orf-bg-elevated)", border: "1px solid var(--orf-border)", color: "var(--orf-text-primary)" }} />
                      <Line type="monotone" dataKey="value" stroke="var(--orf-accent)" strokeWidth={2} />
                    </LineChart>
                  )}
                </ChartFrame>
              </div>
            </Card>
            <div className="grid gap-4 lg:grid-cols-2">
              {results.map((result) => <ResultCard key={result.id} result={result} />)}
            </div>
            <Card className="orf-card-padding">
              <div className="mb-3 text-sm font-semibold orf-text-primary">反馈时间线</div>
              <div className="grid gap-3">
                {feedback.map((item) => <FeedbackCard key={item.id} feedback={item} resultTitle={results.find((result) => result.id === item.linkedResultId)?.title} />)}
              </div>
            </Card>
          </div>
          <div className="grid content-start gap-4">
            <IntegrityCheck hasFeedback={feedback.length > 0} hasTasks={tasks.length > 0} resultRiskCount={atRiskCount} />
            <Card className="orf-card-padding"><div className="text-sm font-semibold orf-text-primary">开放风险</div><div className="mt-3 grid gap-2">{results.filter((result) => result.status === "At Risk").map((result) => <Link key={result.id} to={`/objectives/${objective.id}/results/${result.id}`} className="orf-warning-text rounded-md orf-surface-muted p-3 text-sm">{result.title}</Link>)}</div></Card>
            <Card className="orf-card-padding"><div className="text-sm font-semibold orf-text-primary">相关 AI 系统</div><div className="mt-3 flex flex-wrap gap-2">{["RAG 服务", "Agent 运行时", "评估流水线", "权限审计"].map((item) => <span key={item} className="orf-status-tag border orf-border px-2 py-1 text-xs orf-text-secondary">{item}</span>)}</div></Card>
          </div>
        </div>
      )}

      {tab === "Results" && (
        <Card className="overflow-hidden">
          {results.map((result) => (
            <Link key={result.id} to={`/objectives/${objective.id}/results/${result.id}`} className="orf-table-row grid grid-cols-[1.5fr_140px_90px_90px_90px_110px_110px_110px] items-center gap-3 px-4 py-3 text-sm">
              <span className="orf-text-primary">{result.title}</span><span className="orf-text-secondary">{result.metricName}</span><span>{result.baseline}{result.unit}</span><span>{result.current}{result.unit}</span><span>{result.target}{result.unit}</span><StatusBadge status={result.status} /><span>{result.confidence}%</span><span>{result.owner}</span>
            </Link>
          ))}
        </Card>
      )}

      {tab === "Tasks" && <Card className="overflow-hidden">{tasks.map((task) => <TaskRow key={task.id} task={task} resultTitle={results.find((result) => result.id === task.linkedResultId)?.title} onStatusChange={(status: TaskStatus) => updateTaskStatus(task.id, status)} />)}</Card>}

      {tab === "Feedback" && <Card className="grid gap-3 orf-card-padding">{feedback.map((item) => <div key={item.id} className="grid gap-2"><FeedbackCard feedback={item} resultTitle={results.find((result) => result.id === item.linkedResultId)?.title} /><select className="orf-input max-w-48 px-2 py-1 text-xs" value={item.status} onChange={(event) => updateFeedbackStatus(item.id, event.target.value as FeedbackStatus)}>{(["New", "Reviewing", "Action Created", "Result Updated", "Closed"] as FeedbackStatus[]).map((status) => <option key={status} value={status}>{feedbackStatusLabel[status]}</option>)}</select></div>)}</Card>}

      {tab === "Decisions" && <DecisionLog decisions={decisions} />}

      {tab === "Evaluation" && (
        <Card className="orf-card-padding">
          <div className="grid gap-4 md:grid-cols-3">
            {["准确率", "幻觉率", "检索 Recall@5", "P95 时延", "单次请求成本", "工具调用成功率"].map((metric) => <div key={metric} className="rounded-lg orf-surface-muted p-4 text-sm orf-text-primary">{metric}<div className="mt-2 text-2xl font-semibold orf-text-primary">{metric.includes("时延") ? "4.2s" : metric.includes("成本") ? "$0.038" : metric.includes("幻觉") ? "6.5%" : "82%"}</div></div>)}
          </div>
        </Card>
      )}
    </PageScaffold>
  );
}
