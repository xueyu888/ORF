import { Plus } from "lucide-react";
import { Navigate, useParams } from "react-router-dom";
import { Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";
import { ChartFrame } from "../components/ChartFrame";
import { PageScaffold } from "../components/PageScaffold";
import { FeedbackCard, TaskRow } from "../components/SharedCards";
import { Button, Card, ConfidenceBadge, ProgressBar, StatusBadge } from "../components/ui";
import { useOrf } from "../state/OrfProvider";
import type { TaskStatus } from "../types/orf";
import { metricValue, resultProgress } from "../utils/format";
import { evidenceTypeLabel } from "../utils/labels";

export function ResultDetailPage() {
  const { resultId } = useParams();
  const { state, openModal, updateTaskStatus, updateResultConfidence } = useOrf();
  const result = state.results.find((item) => item.id === resultId);
  if (!result) return <Navigate to="/objectives" replace />;

  const objective = state.objectives.find((item) => item.id === result.objectiveId);
  const evidence = state.evidence.filter((item) => result.evidenceIds.includes(item.id));
  const tasks = state.tasks.filter((task) => result.taskIds.includes(task.id));
  const feedback = state.feedback.filter((item) => result.feedbackIds.includes(item.id));

  return (
    <PageScaffold
      title={result.title}
      subtitle={`目标 / 结果 · ${objective?.title ?? ""}`}
      action={<div className="flex gap-2"><Button variant="secondary"><Plus className="h-4 w-4" />添加证据</Button><Button onClick={() => openModal({ type: "newFeedback", objectiveId: result.objectiveId, resultId: result.id })}>新建反馈</Button><Button variant="secondary" onClick={() => openModal({ type: "newTask", objectiveId: result.objectiveId, resultId: result.id })}>创建任务</Button><Button onClick={() => openModal({ type: "resultUpdate", resultId: result.id })}>提出结果更新</Button></div>}
    >
      <section className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <div className="grid gap-4">
          <Card className="p-5">
            <div className="flex flex-wrap items-center gap-3"><StatusBadge status={result.status} /><ConfidenceBadge value={result.confidence} /><span className="text-sm orf-text-secondary">{result.owner}</span></div>
            <p className="mt-4 text-sm orf-text-secondary">{result.description}</p>
            <div className="mt-5 grid gap-4 lg:grid-cols-[280px_1fr]">
              <div className="rounded-lg border orf-border orf-surface-muted p-4">
                <div className="text-xs orf-text-muted">{result.metricName}</div>
                <div className="mt-2 text-3xl font-semibold orf-text-primary">{metricValue(result.current, result.unit, result.direction)}</div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-xs orf-text-muted"><span>基线 {metricValue(result.baseline, result.unit)}</span><span>目标 {metricValue(result.target, result.unit)}</span><span>{result.direction === "increase" ? "越高越好" : "越低越好"}</span></div>
                <div className="mt-4"><ProgressBar value={resultProgress(result)} /></div>
              </div>
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
            </div>
          </Card>

          <Card className="p-4">
            <div className="mb-3 text-sm font-semibold orf-text-primary">证据</div>
            <div className="grid gap-3">
              {evidence.map((item) => <div key={item.id} className="rounded-lg border orf-border orf-surface-muted p-4"><div className="flex items-center justify-between"><span className="text-sm font-medium orf-text-primary">{item.title}</span><span className="text-xs orf-text-muted">{evidenceTypeLabel[item.type]}</span></div><p className="mt-2 text-sm orf-text-secondary">{item.summary}</p><div className="mt-3 text-xs orf-text-muted">{item.date} · {item.owner} · {item.source}</div></div>)}
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="border-b orf-border p-4 text-sm font-semibold orf-text-primary">关联任务</div>
            {tasks.map((task) => <TaskRow key={task.id} task={task} resultTitle={result.title} onStatusChange={(status: TaskStatus) => updateTaskStatus(task.id, status)} />)}
          </Card>

          <Card className="p-4">
            <div className="mb-3 text-sm font-semibold orf-text-primary">反馈历史</div>
            <div className="grid gap-3">{feedback.map((item) => <FeedbackCard key={item.id} feedback={item} resultTitle={result.title} />)}</div>
          </Card>
        </div>
        <aside className="grid content-start gap-4">
          <Card className="p-4">
            <div className="text-sm font-semibold orf-text-primary">结果定义</div>
            <div className="mt-3 grid gap-3 text-sm orf-text-secondary">
              <p><span className="orf-text-primary">改变什么：</span>{result.metricName}</p>
              <p><span className="orf-text-primary">如何度量：</span>{metricValue(result.current, result.unit)} → {metricValue(result.target, result.unit)}</p>
              <p><span className="orf-text-primary">失败边界：</span>任何回退到基线以上的问题都必须触发反馈评审。</p>
              <p><span className="orf-text-primary">复盘节奏：</span>{result.reviewCadence === "Weekly" ? "每周" : "每两周"}</p>
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-sm font-semibold orf-text-primary">ORF 质量检查</div>
            <div className="mt-3 grid gap-2 text-xs">
              {["可度量", "有证据", "已关联目标", "反馈已更新", "有任务支撑"].map((item) => <div key={item} className="flex justify-between rounded-md orf-surface-muted px-3 py-2"><span>{item}</span><span className="orf-success-text">通过</span></div>)}
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-sm font-semibold orf-text-primary">信心</div>
            <input className="mt-4 w-full" type="range" min="0" max="100" value={result.confidence} onChange={(event) => updateResultConfidence(result.id, Number(event.target.value))} />
            <div className="mt-2 text-sm orf-text-secondary">{result.confidence}%</div>
          </Card>
        </aside>
      </section>
    </PageScaffold>
  );
}
