import { ArrowLeft, Send } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { PageScaffold } from "../components/PageScaffold";
import { Button, Card, Field } from "../components/ui";
import { equalRatios, summarizeContributionReviews } from "../features/challenge/model/contributionReview";
import { useOrf } from "../state/OrfProvider";
import type { ContributionAllocation, LootResultClaimStatus, ResultAcceptedResult } from "../types/orf";

const lootClaimOptions: Array<{ label: string; value: LootResultClaimStatus }> = [
  { label: "完成", value: "completed" },
  { label: "证伪", value: "falsified" },
  { label: "未主张", value: "notClaimed" },
];

const resultReviewOptions: Array<{ label: string; value: ResultAcceptedResult }> = [
  { label: "完成", value: "completed" },
  { label: "证伪", value: "falsified" },
  { label: "失败", value: "failed" },
  { label: "不验收", value: "unreviewed" },
];

export function LootSubmitPage() {
  const { objectiveId } = useParams();
  const navigate = useNavigate();
  const { currentUser, dataReady, reviewObjectiveLoot, state, submitContributionReview, submitLoot } = useOrf();
  const objective = state.objectives.find((item) => item.id === objectiveId);
  const results = useMemo(() => (objective ? state.results.filter((result) => result.objectiveId === objective.id) : []), [objective, state.results]);
  const latestLoot = useMemo(
    () => state.objectiveLoot.filter((item) => item.objectiveId === objectiveId).sort((left, right) => right.submittedAt.localeCompare(left.submittedAt))[0],
    [objectiveId, state.objectiveLoot],
  );
  const [body, setBody] = useState("");
  const [selfTestReportBody, setSelfTestReportBody] = useState("");
  const [claims, setClaims] = useState<Record<string, { claim: LootResultClaimStatus; evidenceText: string }>>({});
  const [resultReviews, setResultReviews] = useState<Record<string, ResultAcceptedResult>>({});
  const [contributionInputs, setContributionInputs] = useState<Record<string, string>>({});
  const [resolutionInputs, setResolutionInputs] = useState<Record<string, string>>({});
  const [resolutionReason, setResolutionReason] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setClaims((current) => {
      const next: typeof current = {};
      for (const result of results) {
        next[result.id] = current[result.id] ?? { claim: "completed", evidenceText: "" };
      }
      return next;
    });
    setResultReviews((current) => {
      const next: typeof current = {};
      for (const result of results) {
        next[result.id] = current[result.id] ?? "completed";
      }
      return next;
    });
  }, [results]);

  useEffect(() => {
    setContributionInputs((current) => ratioInputDefaults(objective?.challengers ?? [], current));
    setResolutionInputs((current) => ratioInputDefaults(objective?.challengers ?? [], current));
  }, [objective?.challengers]);

  if (!objective) {
    return dataReady ? <Navigate to="/tasks" replace /> : <PageScaffold title="加载中" subtitle="正在加载悬赏数据。"><Card className="orf-card-padding text-sm orf-text-secondary">正在加载。</Card></PageScaffold>;
  }

  const currentMember = currentUser?.name ?? "";
  const isChallenger = objective.challengers.includes(currentMember);
  const canSubmit = objective.flowStatus === "frozen" && isChallenger;
  const canReview = currentUser?.role === "admin" && objective.flowStatus === "submitted" && latestLoot;
  const canPeerReview = objective.flowStatus === "submitted" && isChallenger;
  const contributionReviews = state.objectiveContributionReviews.filter((item) => item.objectiveId === objective.id);
  const contributionSummary = summarizeContributionReviews(objective.challengers, contributionReviews);
  const needsContributionResolution = contributionSummary.status !== "ready";
  const hasCurrentPeerReview = contributionReviews.some((item) => item.reviewer === currentMember);
  const objectiveReviewResult = objectiveAcceptedResultFromReviews(results.map((result) => resultReviews[result.id] ?? "completed"));

  const submit = () => {
    const value = body.trim();
    if (!canSubmit) {
      setError("目标冻结后，挑战者才能提交战利品");
      return;
    }
    if (!value) {
      setError("请填写完成说明");
      return;
    }
    if (results.length === 0) {
      setError("这个目标没有可验收的指标");
      return;
    }

    void submitLoot({
      objectiveId: objective.id,
      body: value,
      author: currentUser?.name,
      selfTestReportBody: selfTestReportBody.trim() || null,
      resultClaims: results.map((result) => ({
        resultId: result.id,
        claim: claims[result.id]?.claim ?? "notClaimed",
        evidenceText: claims[result.id]?.evidenceText ?? "",
      })),
    }).then((ok) => {
      if (ok) navigate("/tasks");
    });
  };

  const review = () => {
    if (!canReview || !latestLoot) {
      setError("只有指挥官能验收已提交的战利品");
      return;
    }

    const contributionResolution = needsContributionResolution
      ? {
          ratios: ratioInputsToAllocations(resolutionInputs, objective.challengers),
          reason: resolutionReason.trim() || "指挥官处理匿名互评分歧",
        }
      : undefined;

    if (needsContributionResolution && (contributionResolution?.ratios.length ?? 0) !== objective.challengers.length) {
      setError("请完成贡献分歧处理");
      return;
    }

    void reviewObjectiveLoot(objective.id, {
      lootId: latestLoot.id,
      reason: reason.trim() || undefined,
      resultReviews: results.map((result) => ({
        resultId: result.id,
        acceptedResult: resultReviews[result.id] ?? "completed",
      })),
      contributionResolution,
    }).then((ok) => {
      if (ok) navigate("/reports");
    });
  };

  const submitPeerReview = () => {
    const allocations = ratioInputsToAllocations(contributionInputs, objective.challengers);
    if (!canPeerReview || allocations.length !== objective.challengers.length) {
      setError("请完成匿名互评");
      return;
    }

    void submitContributionReview(objective.id, allocations).then((ok) => {
      if (ok) navigate("/tasks");
    });
  };

  return (
    <PageScaffold
      title={canReview ? "验收战利品" : canPeerReview ? "提交匿名互评" : "提交战利品"}
      subtitle={`目标：${objective.title}`}
      action={
        <Link className="orf-control orf-secondary-action inline-flex items-center gap-2 border px-3 py-2 text-sm font-medium" to="/tasks">
          <ArrowLeft className="h-4 w-4" />
          返回挑战
        </Link>
      }
    >
      <div className="grid max-w-4xl gap-4">
        <Card className="orf-card-padding">
          <div className="grid gap-2">
            <div className="text-xs font-medium orf-text-muted">悬赏目标标题</div>
            <div className="rounded-md border orf-border orf-surface-muted px-3 py-2 text-sm font-semibold orf-text-primary">{objective.title}</div>
            <div className="text-xs orf-text-secondary">当前状态：{objective.flowStatus}</div>
          </div>
        </Card>

        {latestLoot && (
          <Card className="orf-card-padding">
            <div className="grid gap-3 text-sm">
              <div className="font-semibold orf-text-primary">最近提交</div>
              <div className="orf-text-secondary whitespace-pre-wrap">{latestLoot.body}</div>
              {latestLoot.selfTestReportBody && <div className="rounded-md border orf-border p-3 text-xs orf-text-secondary whitespace-pre-wrap">{latestLoot.selfTestReportBody}</div>}
            </div>
          </Card>
        )}

        {canReview ? (
          <Card className="orf-card-padding">
            <form
              className="grid gap-5"
              onSubmit={(event) => {
                event.preventDefault();
                review();
              }}
            >
              <div className="grid gap-3">
                {results.map((result) => (
                  <div key={result.id} className="grid gap-2 rounded-md border orf-border p-3">
                    <div className="text-sm font-semibold orf-text-primary">{result.title}</div>
                    <select className="orf-input px-3 py-2 text-sm" value={resultReviews[result.id] ?? "completed"} onChange={(event) => setResultReviews((items) => ({ ...items, [result.id]: event.target.value as ResultAcceptedResult }))}>
                      {resultReviewOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              <div className="grid gap-2 rounded-md border orf-border orf-surface-muted p-3 text-sm">
                <div className="font-semibold orf-text-primary">目标验收结果</div>
                <div className="orf-text-secondary">{objectiveReviewResultLabel(objectiveReviewResult)}</div>
              </div>
              <div className="grid gap-3">
                <div className="text-sm font-semibold orf-text-primary">匿名互评贡献结果</div>
                <ContributionSummaryView summary={contributionSummary} />
                {needsContributionResolution && (
                  <div className="grid gap-3 rounded-md border orf-border p-3">
                    <div className="text-sm font-semibold orf-text-primary">处理分歧</div>
                    {objective.challengers.map((member) => (
                      <Field key={member} label={`${member} 处理后贡献比例`}>
                        <input className="orf-input px-3 py-2 text-sm" type="number" min="0" step="0.1" value={resolutionInputs[member] ?? "1"} onChange={(event) => setResolutionInputs((items) => ({ ...items, [member]: event.target.value }))} />
                      </Field>
                    ))}
                    <Field label="分歧处理说明">
                      <textarea className="orf-input min-h-20 px-3 py-2 text-sm" value={resolutionReason} onChange={(event) => setResolutionReason(event.target.value)} />
                    </Field>
                  </div>
                )}
              </div>
              <Field label="验收说明">
                <textarea className="orf-input min-h-24 px-3 py-2 text-sm" value={reason} onChange={(event) => setReason(event.target.value)} />
              </Field>
              {error && <div className="text-sm orf-danger-text">{error}</div>}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => navigate("/tasks")}>取消</Button>
                <Button type="submit">验收并结算</Button>
              </div>
            </form>
          </Card>
        ) : canPeerReview ? (
          <Card className="orf-card-padding">
            <form
              className="grid gap-5"
              onSubmit={(event) => {
                event.preventDefault();
                submitPeerReview();
              }}
            >
              <div className="text-sm orf-text-secondary">
                {hasCurrentPeerReview ? "你已提交过匿名互评；再次提交会作为最新评价参与汇总。" : "评价当前目标挑战者的贡献比例，系统会匿名汇总后用于结算。"}
              </div>
              <div className="grid gap-3">
                {objective.challengers.map((member) => (
                  <Field key={member} label={`${member} 贡献比例`}>
                    <input className="orf-input px-3 py-2 text-sm" type="number" min="0" step="0.1" value={contributionInputs[member] ?? "1"} onChange={(event) => setContributionInputs((items) => ({ ...items, [member]: event.target.value }))} />
                  </Field>
                ))}
              </div>
              {error && <div className="text-sm orf-danger-text">{error}</div>}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => navigate("/tasks")}>取消</Button>
                <Button type="submit">提交匿名互评</Button>
              </div>
            </form>
          </Card>
        ) : (
          <Card className="orf-card-padding">
            <form
              className="grid gap-5"
              onSubmit={(event) => {
                event.preventDefault();
                submit();
              }}
            >
              <Field label="完成说明">
                <textarea className="orf-input min-h-32 px-3 py-2 text-sm" value={body} onChange={(event) => { setBody(event.target.value); if (error) setError(""); }} autoFocus />
              </Field>
              <div className="grid gap-3">
                {results.map((result) => (
                  <div key={result.id} className="grid gap-2 rounded-md border orf-border p-3">
                    <div className="text-sm font-semibold orf-text-primary">{result.title}</div>
                    <select className="orf-input px-3 py-2 text-sm" value={claims[result.id]?.claim ?? "completed"} onChange={(event) => setClaims((items) => ({ ...items, [result.id]: { ...(items[result.id] ?? { evidenceText: "" }), claim: event.target.value as LootResultClaimStatus } }))}>
                      {lootClaimOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                    <textarea className="orf-input min-h-20 px-3 py-2 text-sm" placeholder="证据、数据或链接" value={claims[result.id]?.evidenceText ?? ""} onChange={(event) => setClaims((items) => ({ ...items, [result.id]: { ...(items[result.id] ?? { claim: "completed" }), evidenceText: event.target.value } }))} />
                  </div>
                ))}
              </div>
              <Field label="自测报告">
                <textarea className="orf-input min-h-24 px-3 py-2 text-sm" placeholder="先粘贴自测摘要；文件编辑器接入后再支持报告文件。" value={selfTestReportBody} onChange={(event) => setSelfTestReportBody(event.target.value)} />
              </Field>
              {error && <div className="text-sm orf-danger-text">{error}</div>}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => navigate("/tasks")}>取消</Button>
                <Button type="submit" disabled={!canSubmit}>
                  <Send className="h-4 w-4" />
                  提交
                </Button>
              </div>
            </form>
          </Card>
        )}
      </div>
    </PageScaffold>
  );
}

function ContributionSummaryView({ summary }: { summary: ReturnType<typeof summarizeContributionReviews> }) {
  if (summary.status === "missing") {
    return (
      <div className="grid gap-2 rounded-md border orf-border orf-surface-muted p-3 text-sm">
        <div className="orf-text-secondary">等待匿名互评：{summary.missingReviewers.join("、") || "未收到评价"}</div>
      </div>
    );
  }

  if (summary.status === "conflict") {
    return (
      <div className="grid gap-2 rounded-md border orf-border orf-surface-muted p-3 text-sm">
        <div className="orf-warning-text">匿名互评存在分歧，需指挥官处理后结算。</div>
        <RatioList ratios={summary.ratios} />
      </div>
    );
  }

  return (
    <div className="grid gap-2 rounded-md border orf-border orf-surface-muted p-3 text-sm">
      <RatioList ratios={summary.ratios} />
    </div>
  );
}

function RatioList({ ratios }: { ratios: ContributionAllocation[] }) {
  return (
    <div className="grid gap-1">
      {ratios.map((item) => (
        <div key={item.member} className="flex justify-between gap-3">
          <span className="orf-text-primary">{item.member}</span>
          <span className="orf-text-secondary">{formatPercent(item.ratio)}</span>
        </div>
      ))}
    </div>
  );
}

function ratioInputDefaults(members: string[], current: Record<string, string>) {
  const next: Record<string, string> = {};
  for (const item of equalRatios(members)) {
    next[item.member] = current[item.member] ?? "1";
  }
  return next;
}

function ratioInputsToAllocations(values: Record<string, string>, members: string[]) {
  return members
    .map((member) => ({ member, ratio: Number(values[member] ?? 0) }))
    .filter((item) => Number.isFinite(item.ratio) && item.ratio >= 0);
}

function objectiveAcceptedResultFromReviews(reviews: ResultAcceptedResult[]) {
  if (reviews.length === 0) return "abandoned";
  if (reviews.every((review) => review === "completed")) return "completed";
  if (reviews.every((review) => review === "falsified")) return "falsified";
  return "abandoned";
}

function objectiveReviewResultLabel(value: ReturnType<typeof objectiveAcceptedResultFromReviews>) {
  if (value === "completed") return "全部指标完成，目标完成。";
  if (value === "falsified") return "指标全部有效证伪，目标按有效证伪结算。";
  return "存在未完成、失败或未验收指标，目标不按完成结算。";
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}
