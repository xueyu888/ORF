import { Send } from "lucide-react";
import { Link, Navigate, useParams } from "react-router-dom";
import { Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";
import { ChartFrame } from "../components/ChartFrame";
import { PageScaffold } from "../components/PageScaffold";
import { FeedbackCard, TaskRow } from "../components/SharedCards";
import { Button, Card, ConfidenceBadge, ProgressBar, StatusBadge } from "../components/ui";
import { resultDetailCapabilities } from "../features/challenge/model/orfFlowCapabilities";
import { canViewObjectiveRecord } from "../features/challenge/model/objectiveVisibility";
import { canCreateFeedbackForResult } from "../features/feedback/model/feedbackCapabilities";
import { buildResultQualityChecks } from "../features/results/model/resultQuality";
import { useOrf } from "../state/OrfProvider";
import type { TaskStatus } from "../types/orf";
import { metricValue, resultProgress } from "../utils/format";

function EmptyPanel({ label }: { label: string }) {
  return <div className="rounded-lg border orf-border orf-surface-muted p-4 text-sm orf-text-muted">{label}</div>;
}

export function ResultDetailPage() {
  const { resultId } = useParams();
  const { currentUser, dataReady, state, openModal, updateTaskStatus, updateResultConfidence } = useOrf();
  const result = state.results.find((item) => item.id === resultId);
  if (!result) {
    return dataReady ? <Navigate to="/objectives" replace /> : <PageScaffold title="加载中" subtitle="正在加载指标数据。"><Card className="orf-card-padding text-sm orf-text-secondary">正在加载。</Card></PageScaffold>;
  }

  const objective = state.objectives.find((item) => item.id === result.objectiveId);
  if (!canViewObjectiveRecord(objective, currentUser)) {
    return <Navigate to="/tasks" replace />;
  }

  const tasks = state.tasks.filter((task) => task.linkedResultId === result.id);
  const feedback = state.feedback.filter((item) => item.linkedResultId === result.id);
  const metricRequirement = result.metricRequirement?.trim() || "待补充";
  const statisticalObject = result.statisticalObject?.trim() || "待补充";
  const completionStandard = result.completionStandard?.trim() || "待补充";
  const sampleSet = result.sampleSet?.trim() || "待补充";
  const measurementScope = result.measurementScope?.trim() || "待补充";
  const uncertaintyLevel = result.uncertaintyLevel?.trim() || "待补充";
  const reviewCadence = result.reviewCadence === "Weekly" ? "每周" : result.reviewCadence === "Biweekly" ? "每两周" : result.reviewCadence || "待补充";
  const capabilities = resultDetailCapabilities({
    objective,
    currentUser,
    permissionRules: state.permissionRules,
  });
  const canCreateFeedback = canCreateFeedbackForResult(objective, currentUser, result);
  const qualityChecks = buildResultQualityChecks({ feedback, objective, result, tasks });

  return (
    <PageScaffold
      title={result.title}
      subtitle={`目标 / 指标 · ${objective?.title ?? ""}`}
      action={<div className="flex flex-wrap gap-2">{capabilities.canSubmitLoot && <Link className="orf-control orf-primary-action inline-flex items-center gap-2 px-3 py-2 text-sm font-medium" to={`/objectives/${result.objectiveId}/loot`}><Send className="h-4 w-4" />提交目标战利品</Link>}{canCreateFeedback && <Button onClick={() => openModal({ type: "newFeedback", objectiveId: result.objectiveId, resultId: result.id })}>新建反馈</Button>}{capabilities.canCreateTask && <Button variant="secondary" onClick={() => openModal({ type: "newTask", objectiveId: result.objectiveId, resultId: result.id })}>创建行动项</Button>}{capabilities.canProposeUpdate && <Button onClick={() => openModal({ type: "resultUpdate", resultId: result.id })}>提出指标更新</Button>}</div>}
    >
      <section className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <div className="grid gap-4">
          <Card className="orf-card-padding">
            <div className="flex flex-wrap items-center gap-3"><StatusBadge status={result.status} /><ConfidenceBadge value={result.confidence} /><span className="text-sm orf-text-secondary">定义人：{result.definer || "未记录"}</span></div>
            <p className="mt-4 text-sm orf-text-secondary">{result.description}</p>
            <div className="mt-5 grid gap-4 lg:grid-cols-[280px_1fr]">
              <div className="rounded-lg border orf-border orf-surface-muted p-4">
                <div className="text-xs orf-text-muted">{result.metricName}</div>
                <div className="mt-2 text-3xl font-semibold orf-text-primary">{metricValue(result.current, result.unit, result.direction)}</div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-xs orf-text-muted"><span>基线 {metricValue(result.baseline, result.unit)}</span><span>目标 {metricValue(result.target, result.unit)}</span><span>{result.direction === "increase" ? "越高越好" : "越低越好"}</span></div>
                <div className="mt-4"><ProgressBar value={resultProgress(result)} /></div>
              </div>
              {result.trend.length > 0 ? (
                <ChartFrame className="h-64 min-w-0">
                  {({ width, height }) => (
                    <LineChart width={width} height={height} data={result.trend}>
                      <XAxis dataKey="date" tick={{ fill: "var(--orf-text-muted)", fontSize: 11 }} />
                      <YAxis tick={{ fill: "var(--orf-text-muted)", fontSize: 11 }} />
                      <Tooltip contentStyle={{ background: "var(--orf-bg-elevated)", border: "1px solid var(--orf-border)", color: "var(--orf-text-primary)" }} />
                      <Line type="monotone" dataKey="value" stroke="var(--orf-success-text)" strokeWidth={2} />
                    </LineChart>
                  )}
                </ChartFrame>
              ) : (
                <EmptyPanel label="暂无趋势数据。" />
              )}
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="border-b orf-border p-4 text-sm font-semibold orf-text-primary">关联行动项</div>
            {tasks.map((task) => <TaskRow key={task.id} task={task} resultTitle={result.title} onStatusChange={(status: TaskStatus) => updateTaskStatus(task.id, status)} />)}
            {tasks.length === 0 && <div className="p-4"><EmptyPanel label="暂无关联行动项。" /></div>}
          </Card>

          <Card className="orf-card-padding">
            <div className="mb-3 text-sm font-semibold orf-text-primary">反馈历史</div>
            <div className="grid gap-3">
              {feedback.map((item) => <FeedbackCard key={item.id} feedback={item} resultTitle={result.title} />)}
              {feedback.length === 0 && <EmptyPanel label="暂无反馈历史。" />}
            </div>
          </Card>
        </div>
        <aside className="grid content-start gap-4">
          <Card className="orf-card-padding">
            <div className="text-sm font-semibold orf-text-primary">指标口径</div>
            <div className="mt-3 grid gap-3 text-sm orf-text-secondary">
              <p><span className="orf-text-primary">衡量要求：</span>{metricRequirement}</p>
              <p><span className="orf-text-primary">统计对象：</span>{statisticalObject}</p>
              <p><span className="orf-text-primary">完成标准：</span>{completionStandard}</p>
              <p><span className="orf-text-primary">标准样本集：</span>{sampleSet}</p>
              <p><span className="orf-text-primary">测量范围：</span>{measurementScope}</p>
              <p><span className="orf-text-primary">不确定性等级：</span><span className="orf-badge-accent ml-1 inline-flex orf-status-tag border px-2 py-0.5 text-xs">{uncertaintyLevel}</span></p>
              <p><span className="orf-text-primary">复盘节奏：</span>{reviewCadence}</p>
            </div>
          </Card>
          <Card className="orf-card-padding">
            <div className="text-sm font-semibold orf-text-primary">ORF 质量检查</div>
            <div className="mt-3 grid gap-2 text-xs">
              {qualityChecks.map((item) => <div key={item.label} className="flex justify-between rounded-md orf-surface-muted px-3 py-2"><span>{item.label}</span><span className={item.passed ? "orf-success-text" : "orf-warning-text"}>{item.passed ? "通过" : "待补"}</span></div>)}
            </div>
          </Card>
          {capabilities.canEditConfidence && (
            <Card className="orf-card-padding">
              <div className="text-sm font-semibold orf-text-primary">信心</div>
              <input className="mt-4 w-full" type="range" min="0" max="100" value={result.confidence} onChange={(event) => updateResultConfidence(result.id, Number(event.target.value))} />
              <div className="mt-2 text-sm orf-text-secondary">{result.confidence}%</div>
            </Card>
          )}
        </aside>
      </section>
    </PageScaffold>
  );
}
