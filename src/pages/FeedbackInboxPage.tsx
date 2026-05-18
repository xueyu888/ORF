import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { Bar, BarChart, Tooltip, XAxis, YAxis } from "recharts";
import { ChartFrame } from "../components/ChartFrame";
import { PageScaffold } from "../components/PageScaffold";
import { FeedbackCard } from "../components/SharedCards";
import { Button, Card, StatusBadge } from "../components/ui";
import { filterFeedbackForVisibleObjectives, filterResultsForVisibleObjectives, visibleObjectiveIdsForUser, visibleObjectivesForUser } from "../features/challenge/model/objectiveVisibility";
import { canCreateFeedbackFromVisibleState } from "../features/feedback/model/feedbackCapabilities";
import { formatAverageResponseHours, summarizeFeedbackInsights } from "../features/feedback/model/feedbackInsights";
import { useOrf } from "../state/OrfProvider";
import type { FeedbackStatus, Impact } from "../types/orf";

export function FeedbackInboxPage() {
  const { currentUser, state, openModal } = useOrf();
  const [cause, setCause] = useState("All");
  const [status, setStatus] = useState<"All" | FeedbackStatus>("All");
  const [impact, setImpact] = useState<"All" | Impact>("All");
  const visibleObjectiveIds = useMemo(() => visibleObjectiveIdsForUser(state.objectives, currentUser), [currentUser, state.objectives]);
  const visibleObjectives = useMemo(() => visibleObjectivesForUser(state.objectives, currentUser), [currentUser, state.objectives]);
  const visibleResults = useMemo(() => filterResultsForVisibleObjectives(state.results, visibleObjectiveIds), [state.results, visibleObjectiveIds]);
  const visibleFeedback = useMemo(() => filterFeedbackForVisibleObjectives(state.feedback, visibleObjectiveIds), [state.feedback, visibleObjectiveIds]);
  const canCreateFeedback = canCreateFeedbackFromVisibleState({ objectives: visibleObjectives, results: visibleResults }, currentUser);
  const insights = useMemo(() => summarizeFeedbackInsights(visibleFeedback), [visibleFeedback]);

  const feedback = useMemo(
    () =>
      visibleFeedback.filter((item) => {
        const causeMatch = cause === "All" || item.causeCategories.includes(cause);
        const statusMatch = status === "All" || item.status === status;
        const impactMatch = impact === "All" || item.impact === impact;
        return causeMatch && statusMatch && impactMatch;
      }),
    [cause, impact, status, visibleFeedback],
  );

  const chart = insights.causeChart.slice(0, 8).map((item) => ({
    cause: item.cause,
    causeLabel: item.cause.replace(" Issue", ""),
    count: item.count,
  }));

  return (
    <PageScaffold
      title="反馈收件箱"
      subtitle="收集信号、归类原因，并反向更新指标。"
      action={canCreateFeedback ? <Button onClick={() => openModal({ type: "newFeedback" })}><Plus className="h-4 w-4" />新建反馈</Button> : null}
    >
      <Card className="flex flex-wrap items-center gap-3 orf-card-padding">
        <select className="orf-input h-9 max-w-48 px-3 text-sm" value={cause} onChange={(event) => setCause(event.target.value)}><option value="All">全部原因</option>{insights.causeChart.map((item) => <option key={item.cause}>{item.cause}</option>)}</select>
        <select className="orf-input h-9 max-w-48 px-3 text-sm" value={status} onChange={(event) => setStatus(event.target.value as "All" | FeedbackStatus)}><option value="All">全部状态</option>{["New", "Reviewing", "Action Created", "Result Updated", "Closed"].map((item) => <option key={item} value={item}>{item === "New" ? "新反馈" : item === "Reviewing" ? "评审中" : item === "Action Created" ? "已建动作" : item === "Result Updated" ? "已更新指标" : "已关闭"}</option>)}</select>
        <select className="orf-input h-9 max-w-48 px-3 text-sm" value={impact} onChange={(event) => setImpact(event.target.value as "All" | Impact)}><option value="All">全部影响</option>{["Low", "Medium", "High", "Critical"].map((item) => <option key={item} value={item}>{item === "Low" ? "低" : item === "Medium" ? "中" : item === "High" ? "高" : "严重"}</option>)}</select>
      </Card>
      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <div className="grid gap-3">
          {feedback.map((item) => <FeedbackCard key={item.id} feedback={item} resultTitle={visibleResults.find((result) => result.id === item.linkedResultId)?.title} />)}
          {feedback.length === 0 && <Card className="orf-card-padding text-sm orf-text-secondary">暂无匹配反馈。</Card>}
        </div>
        <Card className="orf-card-padding">
          <div className="text-sm font-semibold orf-text-primary">洞察面板</div>
          <ChartFrame className="mt-4 h-56 min-w-0">
            {({ width, height }) => (
              <BarChart width={width} height={height} data={chart}>
                <XAxis dataKey="causeLabel" tick={{ fill: "var(--orf-text-muted)", fontSize: 11 }} />
                <YAxis tick={{ fill: "var(--orf-text-muted)", fontSize: 11 }} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "var(--orf-bg-elevated)", border: "1px solid var(--orf-border)", color: "var(--orf-text-primary)" }} />
                <Bar dataKey="count" fill="var(--orf-accent)" radius={[4, 4, 0, 0]} />
              </BarChart>
            )}
          </ChartFrame>
          <div className="mt-4 grid gap-2">
            <Insight label="高影响反馈" value={insights.highImpactCount.toString()} />
            <Insight label="未分类" value={insights.uncategorizedCount.toString()} />
            <Insight label="平均响应时间" value={formatAverageResponseHours(insights.averageResponseHours)} />
            <Insight label="最高频问题" value={insights.topCause ?? "暂无数据"} />
          </div>
          <div className="mt-4 text-xs orf-text-muted">状态流：<StatusBadge status="New" /> → <StatusBadge status="Reviewing" /> → <StatusBadge status="Action Created" /> → <StatusBadge status="Result Updated" /> → <StatusBadge status="Closed" /></div>
        </Card>
      </div>
    </PageScaffold>
  );
}

function Insight({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between rounded-md orf-surface-muted px-3 py-2 text-sm"><span className="orf-text-secondary">{label}</span><span className="font-medium orf-text-primary">{value}</span></div>;
}
