import { Navigate, useParams } from "react-router-dom";
import { PageScaffold } from "../components/PageScaffold";
import { Button, Card, StatusBadge } from "../components/ui";
import { useOrf } from "../state/OrfProvider";
import { evidenceTypeLabel } from "../utils/labels";

export function FeedbackDetailPage() {
  const { feedbackId } = useParams();
  const { dataReady, state, openModal, updateFeedbackStatus } = useOrf();
  const feedback = state.feedback.find((item) => item.id === feedbackId);
  if (!feedback) {
    return dataReady ? <Navigate to="/feedback" replace /> : <PageScaffold title="加载中" subtitle="正在加载反馈数据。"><Card className="orf-card-padding text-sm orf-text-secondary">正在加载。</Card></PageScaffold>;
  }

  const objective = state.objectives.find((item) => item.id === feedback.linkedObjectiveId);
  const result = state.results.find((item) => item.id === feedback.linkedResultId);
  const evidence = state.evidence.filter((item) => feedback.evidenceIds.includes(item.id));

  return (
    <PageScaffold
      title={feedback.id}
      subtitle={feedback.phenomenon}
      action={<div className="flex gap-2"><Button variant="secondary" onClick={() => openModal({ type: "newTask", objectiveId: feedback.linkedObjectiveId, resultId: feedback.linkedResultId, feedbackId: feedback.id })}>创建行动项</Button><Button onClick={() => openModal({ type: "resultUpdate", resultId: feedback.linkedResultId, feedbackId: feedback.id })}>提出指标更新</Button><Button variant="secondary" onClick={() => updateFeedbackStatus(feedback.id, "Closed")}>标记为已知边界</Button></div>}
    >
      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <div className="grid gap-4">
          <Card className="orf-card-padding"><div className="flex flex-wrap items-center gap-3"><StatusBadge status={feedback.status} /><StatusBadge status={feedback.impact} /><span className="text-sm orf-text-secondary">{feedback.owner}</span><span className="text-sm orf-text-muted">{feedback.createdAt}</span></div><p className="mt-5 text-lg orf-text-primary">{feedback.phenomenon}</p></Card>
          <Card className="orf-card-padding"><div className="mb-3 text-sm font-semibold orf-text-primary">佐证材料</div><div className="grid gap-3">{evidence.map((item) => <div key={item.id} className="rounded-lg orf-surface-muted p-4"><div className="flex items-center justify-between gap-3"><div className="text-sm font-medium orf-text-primary">{item.title}</div><span className="text-xs orf-text-muted">{evidenceTypeLabel[item.type]}</span></div><p className="mt-2 text-sm orf-text-secondary">{item.summary}</p><div className="mt-2 text-xs orf-text-muted">{item.source} · {item.date}</div></div>)}</div></Card>
          <Card className="orf-card-padding"><div className="mb-3 text-sm font-semibold orf-text-primary">原因分析</div><div className="flex flex-wrap gap-2">{feedback.causeCategories.map((cause) => <span key={cause} className="orf-status-tag border orf-border orf-surface-muted px-3 py-1 text-sm orf-text-primary">{cause}: 该信号需要调整指标或行动项</span>)}</div></Card>
          <Card className="orf-card-padding"><div className="text-sm font-semibold orf-text-primary">建议调整</div><p className="mt-3 text-sm orf-text-secondary">{feedback.suggestedAdjustment}</p></Card>
          <Card className="orf-card-padding"><div className="mb-3 text-sm font-semibold orf-text-primary">活动时间线</div><div className="grid gap-3">{feedback.activity.map((item) => <div key={item.id} className="rounded-md orf-surface-muted p-3 text-sm"><div className="orf-text-primary">{item.action}</div><div className="mt-1 text-xs orf-text-muted">{item.at} · {item.actor}</div></div>)}</div></Card>
        </div>
        <aside className="grid content-start gap-4">
          <Card className="orf-card-padding"><div className="text-sm font-semibold orf-text-primary">关联目标</div><div className="mt-3 text-sm orf-text-secondary">{objective?.title}</div></Card>
          <Card className="orf-card-padding"><div className="text-sm font-semibold orf-text-primary">关联指标</div><div className="mt-3 text-sm orf-text-secondary">{result?.title}</div></Card>
          <Card className="orf-card-padding"><div className="text-sm font-semibold orf-text-primary">推荐动作</div><div className="mt-3 grid gap-2 text-sm orf-text-secondary"><button className="rounded-md orf-surface-muted p-3 text-left orf-hover-muted">创建执行行动项</button><button className="rounded-md orf-surface-muted p-3 text-left orf-hover-muted">更新指标表述</button><button className="rounded-md orf-surface-muted p-3 text-left orf-hover-muted">补充回归样本</button></div></Card>
        </aside>
      </div>
    </PageScaffold>
  );
}
