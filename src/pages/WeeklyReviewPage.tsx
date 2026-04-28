import { PageScaffold } from "../components/PageScaffold";
import { Button, Card, StatusBadge } from "../components/ui";
import { useOrf } from "../state/OrfProvider";

export function WeeklyReviewPage() {
  const { state, notify } = useOrf();
  const atRisk = state.results.filter((result) => result.status === "At Risk");

  return (
    <PageScaffold title="周复盘" subtitle="周期：2026 Q2 · 周期范围：Apr 20 - Apr 26" action={<Button onClick={() => notify("周复盘已发布")}>发布复盘</Button>}>
      <div className="grid gap-4 lg:grid-cols-2">
        <ReviewSection title="发生了什么变化？" items={["目标信心从 66% 提升到 72%。", "RAG Recall@5 从 70% 提升到 76%。", "从生产信号中捕获 3 条新反馈。", "关闭 4 个任务，2 个高风险任务进入评审。"]} />
        <Card className="orf-card-padding"><div className="mb-3 text-sm font-semibold orf-text-primary">哪些偏离了目标？</div><div className="grid gap-2">{atRisk.map((result) => <div key={result.id} className="rounded-md orf-surface-muted p-3"><div className="flex justify-between gap-3"><span className="text-sm orf-text-primary">{result.title}</span><StatusBadge status={result.status} /></div><div className="mt-2 text-xs orf-text-muted">最近反馈指向 {state.feedback.find((item) => item.linkedResultId === result.id)?.causeCategories.join(" + ") ?? "执行风险"}。</div></div>)}</div></Card>
        <ReviewSection title="我们学到了什么？" items={["大多数幻觉来自过期的权限文档。", "工具调用失败集中在非幂等 API。", "时延峰值主要由长上下文检索造成。", "反馈分类提升了问题分流速度。"]} />
        <ReviewSection title="下周要改变什么？" items={["更新版本感知检索。", "增加幂等保护。", "扩展回归数据集。", "减少 Prompt 上下文长度。"]} />
      </div>
      <Card className="orf-card-padding">
        <div className="mb-3 text-sm font-semibold orf-text-primary">复盘摘要编辑器</div>
        <textarea className="orf-input min-h-36 p-3 text-sm" defaultValue="本周 ORF Flow 识别出检索新鲜度、工具幂等性和长上下文时延是主要风险来源。下周重点推进版本感知检索、工具调用保护和回归集扩展。" />
      </Card>
    </PageScaffold>
  );
}

function ReviewSection({ title, items }: { title: string; items: string[] }) {
  return <Card className="orf-card-padding"><div className="mb-3 text-sm font-semibold orf-text-primary">{title}</div><div className="grid gap-2">{items.map((item) => <div key={item} className="rounded-md orf-surface-muted p-3 text-sm orf-text-secondary">{item}</div>)}</div></Card>;
}
