import { AlertTriangle, CheckSquare, Gauge, MessageSquare, Target } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import { ChartFrame } from "../components/ChartFrame";
import { PageScaffold } from "../components/PageScaffold";
import { DecisionLog, FeedbackCard, MetricCard, ObjectiveCard } from "../components/SharedCards";
import { Button, Card } from "../components/ui";
import { useOrf } from "../state/OrfProvider";

export function DashboardPage() {
  const { state } = useOrf();
  const navigate = useNavigate();
  const atRiskResults = state.results.filter((result) => result.status === "At Risk");
  const feedbackDue = state.feedback.filter((feedback) => feedback.status !== "Closed");
  const confidence = Math.round(state.objectives.reduce((sum, item) => sum + item.confidence, 0) / state.objectives.length);
  const causeChart = ["Prompt 问题", "检索问题", "知识缺口", "工具调用失败", "时延问题", "成本问题"].map((cause) => ({
    cause,
    count: state.feedback.filter((feedback) => feedback.causeCategories.includes(cause)).length + (cause === "Prompt 问题" ? 2 : cause === "检索问题" ? 3 : 1),
  }));

  return (
    <PageScaffold
      title="ORF 仪表盘"
      subtitle="面向大模型应用团队的目标驱动执行工作台"
      action={<div className="flex gap-2"><Button variant="secondary">2026 Q2</Button><Button onClick={() => navigate("/review")}>开始周复盘</Button></div>}
    >
      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="进行中的目标" value={`${state.objectives.length}`} delta="+1 个目标进入复盘" icon={Target} />
        <MetricCard title="有风险的结果" value={`${atRiskResults.length}`} delta="较上周减少 2 个" icon={AlertTriangle} />
        <MetricCard title="待处理反馈" value={`${feedbackDue.length + 4}`} delta="3 个高影响信号" icon={MessageSquare} />
        <MetricCard title="工程信心" value={`${confidence}%`} delta="较上次周度更新 +6%" icon={Gauge} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[2fr_1fr]">
        <Card className="orf-card-padding">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold orf-text-primary">目标健康看板</div>
              <div className="mt-1 text-xs orf-text-muted">目标健康度、关联结果和最新反馈。</div>
            </div>
            <Link className="text-sm orf-accent-text orf-hover-text" to="/objectives">查看全部</Link>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            {state.objectives.map((objective) => (
              <ObjectiveCard
                key={objective.id}
                objective={objective}
                results={state.results.filter((result) => objective.resultIds.includes(result.id))}
                feedback={state.feedback.filter((feedback) => objective.feedbackIds.includes(feedback.id))}
              />
            ))}
          </div>
        </Card>

        <Card className="orf-card-padding">
          <div className="mb-3 text-sm font-semibold orf-text-primary">待处理反馈</div>
          <div className="grid gap-3">
            {feedbackDue.slice(0, 4).map((feedback) => (
              <FeedbackCard key={feedback.id} feedback={feedback} resultTitle={state.results.find((result) => result.id === feedback.linkedResultId)?.title} />
            ))}
          </div>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <Card className="orf-card-padding">
          <div className="mb-4 text-sm font-semibold orf-text-primary">风险雷达</div>
          <ChartFrame className="h-72 min-w-0">
            {({ width, height }) => (
              <BarChart width={width} height={height} data={causeChart}>
                <CartesianGrid stroke="var(--orf-border)" vertical={false} />
                <XAxis dataKey="cause" tick={{ fill: "var(--orf-text-muted)", fontSize: 11 }} interval={0} angle={-18} textAnchor="end" height={70} />
                <YAxis tick={{ fill: "var(--orf-text-muted)", fontSize: 11 }} />
                <Tooltip contentStyle={{ background: "var(--orf-bg-elevated)", border: "1px solid var(--orf-border)", color: "var(--orf-text-primary)" }} />
                <Bar dataKey="count" fill="var(--orf-accent)" radius={[4, 4, 0, 0]} />
              </BarChart>
            )}
          </ChartFrame>
        </Card>
        <DecisionLog decisions={state.decisions.slice(0, 3)} />
      </section>

      <Card className="orf-card-padding">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold orf-text-primary"><CheckSquare className="h-4 w-4 orf-accent-text" /> 我的 ORF 待办</div>
        <div className="grid gap-3 md:grid-cols-4">
          {["更新 2 个结果", "评审 3 条反馈", "关闭 4 个任务", "准备周度更新"].map((todo) => (
            <div key={todo} className="rounded-lg border orf-border orf-surface-muted p-4 text-sm orf-text-primary">{todo}</div>
          ))}
        </div>
      </Card>
    </PageScaffold>
  );
}
