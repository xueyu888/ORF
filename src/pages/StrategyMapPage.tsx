import { useState } from "react";
import { Link } from "react-router-dom";
import { PageScaffold } from "../components/PageScaffold";
import { Card, ProgressBar, StatusBadge } from "../components/ui";
import { useOrf } from "../state/OrfProvider";

type NodeInfo = { type: string; title: string; status?: string; progress?: number; path?: string; challenger?: string };

export function StrategyMapPage() {
  const { state } = useOrf();
  const [selected, setSelected] = useState<NodeInfo>({ type: "北极星目标", title: "建立可靠的 AI 应用交付能力", progress: 62 });
  const pillars = ["评估优先", "可靠 RAG", "Agent 安全", "成本与时延控制", "反馈驱动迭代"];

  return (
    <PageScaffold title="策略地图" subtitle="把日常执行追溯到可度量的指标。">
      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <Card className="overflow-hidden orf-card-padding">
          <div>
            <StrategyRow nodes={[{ type: "北极星目标", title: "建立可靠的 AI 应用交付能力", progress: 62 }]} onSelect={setSelected} />
            <Connector />
            <StrategyRow nodes={pillars.map((pillar) => ({ type: "战略支柱", title: pillar, progress: 60 }))} onSelect={setSelected} />
            <Connector />
            <StrategyRow nodes={state.objectives.map((objective) => ({ type: "目标", title: objective.title, status: objective.status, progress: objective.progress, path: `/objectives/${objective.id}` }))} onSelect={setSelected} />
            <Connector />
            <StrategyRow nodes={state.results.slice(0, 5).map((result) => {
              const objective = state.objectives.find((item) => item.id === result.objectiveId);
              return { type: "指标", title: result.title, status: result.status, progress: result.confidence, challenger: objective?.challengers.join("、"), path: `/objectives/${result.objectiveId}/results/${result.id}` };
            })} onSelect={setSelected} />
            <Connector />
            <StrategyRow nodes={state.tasks.slice(0, 4).map((task) => ({ type: "行动项", title: task.title, status: task.status, progress: task.status === "Done" ? 100 : 45, owner: task.assignee, path: "/tasks" }))} onSelect={setSelected} />
          </div>
        </Card>
        <Card className="orf-card-padding">
          <div className="text-xs uppercase tracking-wide orf-text-muted">{selected.type}</div>
          <div className="mt-2 text-lg font-semibold orf-text-primary">{selected.title}</div>
          <div className="mt-4 grid gap-3 text-sm">
            {selected.challenger && <Info label="挑战者" value={selected.challenger} />}
            {selected.status && <div className="flex items-center justify-between rounded-md orf-surface-muted p-3"><span className="orf-text-muted">状态</span><StatusBadge status={selected.status as never} /></div>}
            {typeof selected.progress === "number" && <div className="rounded-md orf-surface-muted p-3"><div className="mb-2 flex justify-between text-xs orf-text-muted"><span>进度</span><span>{selected.progress}%</span></div><ProgressBar value={selected.progress} /></div>}
            {selected.path && <Link to={selected.path} className="orf-primary-action rounded-md px-3 py-2 text-center text-sm font-medium">打开</Link>}
          </div>
        </Card>
      </div>
    </PageScaffold>
  );
}

function StrategyRow({ nodes, onSelect }: { nodes: NodeInfo[]; onSelect: (node: NodeInfo) => void }) {
  return <div className="grid grid-cols-5 gap-4">{nodes.map((node) => <button key={node.title} onClick={() => onSelect(node)} className="min-h-24 rounded-lg border orf-border orf-surface-muted p-3 text-left orf-hover-muted"><div className="text-xs orf-text-muted">{node.type}</div><div className="mt-2 line-clamp-2 text-sm font-medium orf-text-primary">{node.title}</div>{node.status && <div className="mt-3"><StatusBadge status={node.status as never} /></div>}</button>)}</div>;
}

function Connector() {
  return <div className="orf-text-faint flex h-10 items-center justify-center">│</div>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between rounded-md orf-surface-muted p-3"><span className="orf-text-muted">{label}</span><span className="orf-text-primary">{value}</span></div>;
}
