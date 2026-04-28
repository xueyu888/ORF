import { PageScaffold } from "../components/PageScaffold";
import { Button, Card, StatusBadge } from "../components/ui";
import { useOrf } from "../state/OrfProvider";

export function AIEvaluationPage() {
  const { state, openModal } = useOrf();
  const metrics = [
    ["准确率", "82%"],
    ["幻觉率", "6.5%"],
    ["Recall@5", "76%"],
    ["工具调用成功率", "91%"],
    ["P95 时延", "4.2s"],
    ["平均请求成本", "$0.038"],
  ];

  return (
    <PageScaffold title="AI 评估" subtitle="追踪 AI 应用流程的质量、成本、时延和可靠性。">
      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">{metrics.map(([label, value]) => <Card key={label} className="orf-card-padding"><div className="text-xs orf-text-muted">{label}</div><div className="mt-2 text-2xl font-semibold orf-text-primary">{value}</div></Card>)}</div>
      <Card className="overflow-hidden">
        <div className="border-b orf-border p-4 text-sm font-semibold orf-text-primary">评估运行</div>
        <div className="grid grid-cols-[120px_1fr_150px_150px_130px_120px_90px_110px_100px_100px_110px] gap-3 border-b orf-border px-4 py-3 text-xs orf-text-muted">
          <span>运行</span><span>场景</span><span>数据集</span><span>模型</span><span>Prompt</span><span>RAG</span><span>准确率</span><span>幻觉率</span><span>时延</span><span>成本</span><span>状态</span>
        </div>
        {state.evalRuns.map((run) => <div key={run.id} className="orf-table-row grid grid-cols-[120px_1fr_150px_150px_130px_120px_90px_110px_100px_100px_110px] items-center gap-3 px-4 py-3 text-sm"><span className="font-mono text-xs orf-text-muted">{run.id}</span><span>{run.scenario}</span><span className="orf-text-secondary">{run.dataset}</span><span className="orf-text-secondary">{run.model}</span><span>{run.promptVersion}</span><span>{run.ragVersion}</span><span>{run.accuracy}%</span><span>{run.hallucination}%</span><span>{run.latency}s</span><span>${run.cost}</span><StatusBadge status={run.status} /></div>)}
      </Card>
      <div className="grid gap-4 lg:grid-cols-5">{state.scenarios.map((scenario) => <Card key={scenario.id} interactive className="orf-card-padding"><div className="text-sm font-semibold orf-text-primary">{scenario.title}</div><div className="mt-3 text-2xl font-semibold orf-text-primary">{scenario.qualityScore}</div><div className="text-xs orf-text-muted">质量分</div><div className="mt-3 text-xs orf-text-secondary">主要失败原因：{scenario.topFailureCause}</div><div className="mt-1 text-xs orf-text-muted">{scenario.openFeedbackCount} 条开放反馈</div></Card>)}</div>
      <Card className="orf-card-padding">
        <div className="mb-3 text-sm font-semibold orf-text-primary">失败样本</div>
        <div className="grid gap-3">{state.failureSamples.map((sample) => <div key={sample.id} className="rounded-lg border orf-border orf-surface-muted p-4"><div className="text-sm font-semibold orf-text-primary">{sample.question}</div><div className="mt-3 grid gap-3 lg:grid-cols-3"><p className="text-sm orf-text-secondary"><span className="orf-text-primary">模型回答：</span>{sample.modelAnswer}</p><p className="text-sm orf-text-secondary"><span className="orf-text-primary">期望答案：</span>{sample.expectedAnswer}</p><p className="text-sm orf-text-secondary"><span className="orf-text-primary">判定原因：</span>{sample.reason}</p></div><Button className="mt-4" variant="secondary" onClick={() => openModal({ type: "newFeedback", resultId: sample.linkedResultId })}>创建反馈</Button></div>)}</div>
      </Card>
    </PageScaffold>
  );
}
