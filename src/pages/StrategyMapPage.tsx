import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PageScaffold } from "../components/PageScaffold";
import { Card, EmptyState, ProgressBar, StatusBadge } from "../components/ui";
import { buildStrategyMap, type StrategyNode } from "../features/strategy/model/strategyMap";
import { useOrf } from "../state/OrfProvider";

export function StrategyMapPage() {
  const { state } = useOrf();
  const strategyMap = useMemo(() => buildStrategyMap(state), [state]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = strategyMap.layers.flatMap((layer) => layer.nodes).find((node) => node.id === selectedId) ?? strategyMap.defaultSelected;

  return (
    <PageScaffold title="策略地图" subtitle="把日常执行追溯到可度量的指标。">
      {strategyMap.layers.length === 0 || !selected ? (
        <EmptyState title="暂无策略地图数据" description="创建目标、指标和行动项后，这里会按真实 ORF 状态生成策略地图。" />
      ) : (
      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <Card className="overflow-hidden orf-card-padding">
          <div>
            {strategyMap.layers.map((layer, index) => (
              <div key={layer.id}>
                {index > 0 && <Connector />}
                <StrategyRow nodes={layer.nodes} onSelect={(node) => setSelectedId(node.id)} />
              </div>
            ))}
          </div>
        </Card>
        <Card className="orf-card-padding">
          <div className="text-xs uppercase tracking-wide orf-text-muted">{selected.type}</div>
          <div className="mt-2 text-lg font-semibold orf-text-primary">{selected.title}</div>
          <div className="mt-4 grid gap-3 text-sm">
            {selected.challenger && <Info label="挑战者" value={selected.challenger} />}
            {selected.owner && <Info label="执行人" value={selected.owner} />}
            {selected.status && <div className="flex items-center justify-between rounded-md orf-surface-muted p-3"><span className="orf-text-muted">状态</span><StatusBadge status={selected.status} /></div>}
            {typeof selected.progress === "number" && <div className="rounded-md orf-surface-muted p-3"><div className="mb-2 flex justify-between text-xs orf-text-muted"><span>进度</span><span>{selected.progress}%</span></div><ProgressBar value={selected.progress} /></div>}
            {selected.path && <Link to={selected.path} className="orf-primary-action rounded-md px-3 py-2 text-center text-sm font-medium">打开</Link>}
          </div>
        </Card>
      </div>
      )}
    </PageScaffold>
  );
}

function StrategyRow({ nodes, onSelect }: { nodes: StrategyNode[]; onSelect: (node: StrategyNode) => void }) {
  return <div className="grid grid-cols-5 gap-4">{nodes.map((node) => <button key={node.id} onClick={() => onSelect(node)} className="min-h-24 rounded-lg border orf-border orf-surface-muted p-3 text-left orf-hover-muted"><div className="text-xs orf-text-muted">{node.type}</div><div className="mt-2 line-clamp-2 text-sm font-medium orf-text-primary">{node.title}</div>{node.status && <div className="mt-3"><StatusBadge status={node.status} /></div>}</button>)}</div>;
}

function Connector() {
  return <div className="orf-text-faint flex h-10 items-center justify-center">│</div>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between rounded-md orf-surface-muted p-3"><span className="orf-text-muted">{label}</span><span className="orf-text-primary">{value}</span></div>;
}
