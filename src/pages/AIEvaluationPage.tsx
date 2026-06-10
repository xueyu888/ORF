import { useNavigate } from "react-router-dom";
import { PageScaffold } from "../components/PageScaffold";
import { Button, Card, StatusBadge } from "../components/ui";
import { evaluationMetricCards, summarizeEvalRuns } from "../features/evaluation/model/evaluationSummary";
import { canCreateTeamFeedback } from "../features/feedback/model/feedbackCapabilities";
import { useOrf } from "../state/OrfProvider";

export function AIEvaluationPage() {
  const navigate = useNavigate();
  const { currentUser, state } = useOrf();
  const metrics = evaluationMetricCards(summarizeEvalRuns(state.evalRuns));

  return (
    <PageScaffold title="AI 评估" subtitle="追踪 AI 应用流程的质量、成本、时延和可靠性。">
      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">{metrics.map((metric) => <Card key={metric.label} className="orf-card-padding"><div className="text-xs orf-text-muted">{metric.label}</div><div className="mt-2 text-2xl font-semibold orf-text-primary">{metric.value}</div><div className="mt-2 text-xs orf-text-muted">{metric.detail}</div></Card>)}</div>
      <Card className="overflow-hidden">
        <div className="border-b orf-border p-4 text-sm font-semibold orf-text-primary">评估运行</div>
        <div className="grid grid-cols-[120px_1fr_150px_150px_130px_120px_90px_110px_100px_100px_110px] gap-3 border-b orf-border px-4 py-3 text-xs orf-text-muted">
          <span>运行</span><span>场景</span><span>数据集</span><span>模型</span><span>Prompt</span><span>RAG</span><span>准确率</span><span>幻觉率</span><span>时延</span><span>成本</span><span>状态</span>
        </div>
        {state.evalRuns.map((run) => <div key={run.id} className="orf-table-row grid grid-cols-[120px_1fr_150px_150px_130px_120px_90px_110px_100px_100px_110px] items-center gap-3 px-4 py-3 text-sm"><span className="font-mono text-xs orf-text-muted">{run.id}</span><span>{run.scenario}</span><span className="orf-text-secondary">{run.dataset}</span><span className="orf-text-secondary">{run.model}</span><span>{run.promptVersion}</span><span>{run.ragVersion}</span><span>{run.accuracy}%</span><span>{run.hallucination}%</span><span>{run.latency}s</span><span>${run.cost}</span><StatusBadge status={run.status} /></div>)}
        {state.evalRuns.length === 0 && <div className="px-4 py-6 text-sm orf-text-muted">暂无评估运行。</div>}
      </Card>
      <div className="grid gap-4 lg:grid-cols-5">
        {state.scenarios.map((scenario) => (
          <Card key={scenario.id} interactive className="orf-card-padding">
            <div className="text-sm font-semibold orf-text-primary">{scenario.title}</div>
            <div className="mt-3 text-2xl font-semibold orf-text-primary">{scenario.qualityScore}</div>
            <div className="text-xs orf-text-muted">质量分</div>
            <div className="mt-3 text-xs orf-text-secondary">主要失败原因：{scenario.topFailureCause}</div>
            <div className="mt-1 text-xs orf-text-muted">{scenario.openFeedbackCount} 条开放反馈</div>
          </Card>
        ))}
        {state.scenarios.length === 0 && <Card className="orf-card-padding text-sm orf-text-muted lg:col-span-5">暂无评估场景。</Card>}
      </div>
      <Card className="orf-card-padding">
        <div className="mb-3 text-sm font-semibold orf-text-primary">失败样本</div>
        <div className="grid gap-3">{state.failureSamples.map((sample) => {
          const canCreateFeedback = canCreateTeamFeedback(currentUser);

          return <div key={sample.id} className="rounded-lg border orf-border orf-surface-muted p-4"><div className="text-sm font-semibold orf-text-primary">{sample.question}</div><div className="mt-3 grid gap-3 lg:grid-cols-3"><p className="text-sm orf-text-secondary"><span className="orf-text-primary">模型回答：</span>{sample.modelAnswer}</p><p className="text-sm orf-text-secondary"><span className="orf-text-primary">期望答案：</span>{sample.expectedAnswer}</p><p className="text-sm orf-text-secondary"><span className="orf-text-primary">判定原因：</span>{sample.reason}</p></div>{canCreateFeedback && <Button className="mt-4" variant="secondary" onClick={() => navigate("/feedback/new")}>创建反馈</Button>}</div>;
        })}{state.failureSamples.length === 0 && <div className="rounded-lg border orf-border orf-surface-muted p-4 text-sm orf-text-muted">暂无失败样本。</div>}</div>
      </Card>
    </PageScaffold>
  );
}
