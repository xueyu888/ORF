import { AlertTriangle, CheckSquare, Gauge, MessageSquare, Target } from "lucide-react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import { ChartFrame } from "../components/ChartFrame";
import { PageScaffold } from "../components/PageScaffold";
import { DecisionLog, FeedbackCard, MetricCard, ObjectiveCard } from "../components/SharedCards";
import { Card } from "../components/ui";
import {
  filterResultsForVisibleObjectives,
  filterTasksForVisibleObjectives,
  visibleObjectiveIdsForUser,
  visibleObjectivesForUser,
} from "../features/challenge/model/objectiveVisibility";
import { summarizeDashboardState } from "../features/dashboard/model/dashboardSummary";
import { useFeedbackIssueReadModel } from "../features/feedback/useFeedbackIssueReadModel";
import { readModelInvalidationKey } from "../features/realtime/readModelInvalidations";
import { useOrf } from "../state/OrfProvider";
import { taskStatusLabel } from "../utils/labels";

export function DashboardPage() {
  const { currentUser, readModelInvalidations, state } = useOrf();
  const visibleObjectiveIds = visibleObjectiveIdsForUser(state.objectives, currentUser);
  const visibleObjectives = visibleObjectivesForUser(state.objectives, currentUser);
  const visibleResults = filterResultsForVisibleObjectives(state.results, visibleObjectiveIds, currentUser);
  const feedbackInvalidationKey = readModelInvalidationKey(readModelInvalidations, "feedback");
  const feedbackReadModel = useFeedbackIssueReadModel(currentUser?.status === "active", feedbackInvalidationKey);
  const visibleFeedback = feedbackReadModel.data.feedback;
  const visibleTasks = filterTasksForVisibleObjectives(state.tasks, visibleObjectiveIds, currentUser);
  const visibleDecisions = currentUser?.role === "admin" ? state.decisions : state.decisions.filter((decision) => visibleObjectiveIds.has(decision.linkedObjectiveId));
  const summary = summarizeDashboardState(
    {
      feedbackIssues: visibleFeedback,
      objectives: visibleObjectives,
      results: visibleResults,
      tasks: visibleTasks,
    },
    currentUser,
  );

  return (
    <PageScaffold
      title="ORF 仪表盘"
      subtitle="面向大模型应用的目标驱动执行工作台"
      action={<div className="orf-status-tag orf-accent-soft px-3 py-2 text-sm font-medium">{summary.latestCycle ?? "暂无周期"}</div>}
    >
      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="进行中的目标" value={`${summary.activeObjectives.length}`} delta={`${visibleObjectives.length} 个目标总数`} icon={Target} />
        <MetricCard title="有风险的指标" value={`${summary.atRiskResults.length}`} delta="来自当前指标状态" icon={AlertTriangle} />
        <MetricCard title="待处理反馈" value={`${summary.pendingFeedback.length}`} delta={`${summary.highImpactFeedback.length} 个高影响信号`} icon={MessageSquare} />
        <MetricCard title="工程信心" value={`${summary.averageConfidence}%`} delta={`${visibleObjectives.length} 个目标样本`} icon={Gauge} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[2fr_1fr]">
        <Card className="orf-card-padding">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold orf-text-primary">目标健康看板</div>
              <div className="mt-1 text-xs orf-text-muted">目标健康度和进度。</div>
            </div>
            <Link className="text-sm orf-accent-text orf-hover-text" to="/tasks">查看全部</Link>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            {visibleObjectives.map((objective) => (
              <ObjectiveCard
                key={objective.id}
                objective={objective}
                results={visibleResults.filter((result) => objective.resultIds.includes(result.id))}
              />
            ))}
          </div>
        </Card>

        <Card className="orf-card-padding">
          <div className="mb-3 text-sm font-semibold orf-text-primary">待处理反馈</div>
          <div className="grid gap-3">
            {summary.pendingFeedback.slice(0, 4).map((feedback) => (
              <FeedbackCard key={feedback.id} feedback={feedback} />
            ))}
            {summary.pendingFeedback.length === 0 && <div className="rounded-md border orf-border orf-surface-muted p-3 text-sm orf-text-muted">暂无待处理反馈。</div>}
          </div>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <Card className="orf-card-padding">
          <div className="mb-4 text-sm font-semibold orf-text-primary">风险雷达</div>
          <ChartFrame className="h-72 min-w-0">
            {({ width, height }) => (
              summary.causeChart.length > 0 ? (
                <BarChart width={width} height={height} data={summary.causeChart}>
                  <CartesianGrid stroke="var(--orf-border)" vertical={false} />
                  <XAxis dataKey="cause" tick={{ fill: "var(--orf-text-muted)", fontSize: 11 }} interval={0} angle={-18} textAnchor="end" height={70} />
                  <YAxis tick={{ fill: "var(--orf-text-muted)", fontSize: 11 }} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: "var(--orf-bg-elevated)", border: "1px solid var(--orf-border)", color: "var(--orf-text-primary)" }} />
                  <Bar dataKey="count" fill="var(--orf-accent)" radius={[4, 4, 0, 0]} />
                </BarChart>
              ) : (
                <div className="flex h-full w-full items-center justify-center rounded-md border orf-border orf-surface-muted text-sm orf-text-muted">暂无待处理反馈原因。</div>
              )
            )}
          </ChartFrame>
        </Card>
        <DecisionLog decisions={visibleDecisions.slice(0, 3)} />
      </section>

      <Card className="orf-card-padding">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold orf-text-primary"><CheckSquare className="h-4 w-4 orf-accent-text" /> 我的 ORF 待办</div>
        <div className="grid gap-3 md:grid-cols-4">
          {summary.myOpenTasks.slice(0, 4).map((task) => (
            <Link key={task.id} to="/tasks" className="block rounded-lg border orf-border orf-surface-muted p-4 text-sm orf-text-primary orf-hover-muted">
              <div className="line-clamp-2">{task.title}</div>
              <div className="mt-2 text-xs orf-text-muted">{taskStatusLabel[task.status]} · {task.dueDate}</div>
            </Link>
          ))}
          {summary.myOpenTasks.length === 0 && <div className="rounded-lg border orf-border orf-surface-muted p-4 text-sm orf-text-muted">暂无分配给你的待办。</div>}
        </div>
      </Card>
    </PageScaffold>
  );
}
