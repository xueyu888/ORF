import { PageScaffold } from "../components/PageScaffold";
import { DecisionLog } from "../components/SharedCards";
import { Button, Card, StatusBadge } from "../components/ui";
import { useOrf } from "../state/OrfProvider";

export function ReportsPage() {
  const { state, notify } = useOrf();
  const atRisk = state.results.filter((result) => result.status === "At Risk");

  return (
    <PageScaffold title="汇报" subtitle="面向管理者查看目标进度、反馈主题和下周重点。" action={<div className="flex gap-2"><Button variant="secondary">演示模式</Button><Button onClick={() => notify("摘要已复制")}>复制摘要</Button></div>}>
      <Card className="p-5"><div className="text-sm font-semibold orf-text-primary">管理摘要</div><p className="mt-3 text-sm orf-text-secondary">ORF Flow 显示工程信心正在提升，但检索新鲜度、幻觉率和时延仍是当前 AI 应用周期的最高风险。</p></Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4"><div className="mb-3 text-sm font-semibold orf-text-primary">目标进度</div><div className="grid gap-2">{state.objectives.map((objective) => <div key={objective.id} className="flex items-center justify-between rounded-md orf-surface-muted p-3"><span className="text-sm orf-text-primary">{objective.title}</span><span className="text-sm orf-text-secondary">{objective.progress}%</span></div>)}</div></Card>
        <Card className="p-4"><div className="mb-3 text-sm font-semibold orf-text-primary">有风险的结果</div><div className="grid gap-2">{atRisk.map((result) => <div key={result.id} className="flex items-center justify-between rounded-md orf-surface-muted p-3"><span className="text-sm orf-text-primary">{result.title}</span><StatusBadge status={result.status} /></div>)}</div></Card>
      </div>
      <div className="grid gap-4 lg:grid-cols-2"><Card className="p-4"><div className="mb-3 text-sm font-semibold orf-text-primary">反馈主题</div><div className="flex flex-wrap gap-2">{state.causeCategories.slice(0, 8).map((cause) => <span key={cause} className="rounded-full border orf-border orf-surface-muted px-3 py-1 text-sm orf-text-secondary">{cause}</span>)}</div></Card><DecisionLog decisions={state.decisions} /></div>
      <Card className="p-4"><div className="text-sm font-semibold orf-text-primary">下周重点</div><div className="mt-3 grid gap-2 md:grid-cols-3">{["版本感知检索", "Agent 幂等保护", "长上下文成本降低"].map((item) => <div key={item} className="rounded-md orf-surface-muted p-3 text-sm orf-text-secondary">{item}</div>)}</div></Card>
    </PageScaffold>
  );
}
