import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PageScaffold } from "../components/PageScaffold";
import { ObjectiveCard } from "../components/SharedCards";
import { Button, Card, EmptyState, ProgressBar, StatusBadge } from "../components/ui";
import { hasPermission } from "../config/permissions";
import { useOrf } from "../state/OrfProvider";
import type { WorkStatus } from "../types/orf";

export function ObjectivesPage() {
  const { currentUser, state, openModal } = useOrf();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"All" | WorkStatus>("All");
  const [view, setView] = useState<"Cards" | "Table">("Cards");
  const canCreateObjective = hasPermission(currentUser, state.permissionRules, "objective.create");

  const objectives = useMemo(
    () =>
      state.objectives.filter((objective) => {
        const queryMatch = `${objective.title} ${objective.description}`.toLowerCase().includes(query.toLowerCase());
        const statusMatch = status === "All" || objective.status === status;
        return queryMatch && statusMatch;
      }),
    [query, state.objectives, status],
  );

  return (
    <PageScaffold
      title="目标"
      subtitle="管理 ORF 的 O 层。目标定义团队想要改变的状态。"
      action={canCreateObjective ? <Button onClick={() => openModal({ type: "newObjective" })}><Plus className="h-4 w-4" />新建目标</Button> : undefined}
    >
      <Card className="flex flex-wrap items-center gap-3 orf-card-padding">
        <input className="orf-input h-9 max-w-xs px-3 text-sm" placeholder="搜索目标..." value={query} onChange={(event) => setQuery(event.target.value)} />
        <select className="orf-input h-9 max-w-40 px-3 text-sm" value={status} onChange={(event) => setStatus(event.target.value as "All" | WorkStatus)}>
          {["All", "On Track", "At Risk", "Blocked", "Draft"].map((item) => <option key={item} value={item}>{item === "All" ? "全部状态" : item === "On Track" ? "正常" : item === "At Risk" ? "有风险" : item === "Blocked" ? "阻塞" : "草稿"}</option>)}
        </select>
        <select className="orf-input h-9 max-w-40 px-3 text-sm"><option>2026 Q2</option><option>2026 Q3 Draft</option></select>
        <div className="ml-auto flex rounded-md border orf-border p-1">
          {(["Cards", "Table"] as const).map((item) => (
            <button key={item} onClick={() => setView(item)} className={`rounded px-3 py-1 text-xs ${view === item ? "orf-selected orf-text-primary" : "orf-text-secondary orf-hover-text"}`}>{item === "Cards" ? "卡片" : "表格"}</button>
          ))}
        </div>
      </Card>

      {objectives.length === 0 ? (
        <EmptyState title="没有找到目标" description="可以清空筛选，或为当前 ORF 周期创建一个新目标。" />
      ) : view === "Cards" ? (
        <div className="grid gap-4 lg:grid-cols-3">
          {objectives.map((objective) => (
            <ObjectiveCard
              key={objective.id}
              objective={objective}
              results={state.results.filter((result) => objective.resultIds.includes(result.id))}
              feedback={state.feedback.filter((feedback) => objective.feedbackIds.includes(feedback.id))}
            />
          ))}
        </div>
      ) : (
        <Card className="overflow-hidden">
          <div className="grid grid-cols-[1.6fr_110px_120px_1fr_90px_90px_120px] gap-3 border-b orf-border px-4 py-3 text-xs font-medium orf-text-muted">
            <span>目标</span><span>状态</span><span>信心</span><span>进度</span><span>指标</span><span>反馈</span><span>最近更新</span>
          </div>
          {objectives.map((objective) => (
            <Link key={objective.id} to={`/objectives/${objective.id}`} className="orf-table-row grid grid-cols-[1.6fr_110px_120px_1fr_90px_90px_120px] items-center gap-3 px-4 py-3 text-sm">
              <span className="font-medium orf-text-primary">{objective.title}</span>
              <StatusBadge status={objective.status} />
              <span className="orf-text-secondary">{objective.confidence}%</span>
              <ProgressBar value={objective.progress} />
              <span className="orf-text-secondary">{objective.resultIds.length}</span>
              <span className="orf-text-secondary">{objective.feedbackIds.length}</span>
              <span className="orf-text-muted">{objective.updatedAt}</span>
            </Link>
          ))}
        </Card>
      )}
    </PageScaffold>
  );
}
