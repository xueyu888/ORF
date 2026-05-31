import { ArrowLeft, ClipboardCheck, Send } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { PageScaffold } from "../components/PageScaffold";
import { Button, Card, Field } from "../components/ui";
import { canViewObjectiveRecord } from "../features/challenge/model/objectiveVisibility";
import { useOrf } from "../state/OrfProvider";
import {
  canRequestObjectiveAlignment,
  latestObjectiveAlignmentRequest,
  latestOpenObjectiveAlignmentRequest,
  objectiveAlignmentRequestStatusLabel,
} from "../domain/orfAlignment";
import {
  canReviewObjectiveLootByFlow,
  canSubmitObjectiveContributionReviewByFlow,
  canSubmitObjectiveLootByFlow,
} from "../domain/orfLifecycle";
import {
  canRequestObjectiveTrialReview,
  canReviewObjectiveTrialReview,
  latestObjectiveTrialReview,
  objectiveTrialReviewStatusLabel,
} from "../domain/orfTrialReview";
import { objectiveAcceptedResultFromReviews } from "../domain/orfSettlement";
import type { ContributionAllocation, LootResultClaim, LootResultClaimStatus, ObjectiveTrialReviewStatus, ResultAcceptedResult } from "../types/orf";

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

const CONTRIBUTION_PERCENT_TOTAL = 100;
const CONTRIBUTION_PERCENT_TOLERANCE = 0.01;

export function LootSubmitPage() {
  const { objectiveId } = useParams();
  const navigate = useNavigate();
  const { currentUser, dataReady, requestObjectiveAlignment, reviewObjectiveLoot, reviewObjectiveTrialReview, state, submitContributionReview, submitLoot, submitObjectiveTrialReview } = useOrf();
  const objective = state.objectives.find((item) => item.id === objectiveId);
  const results = useMemo(() => (objective ? state.results.filter((result) => result.objectiveId === objective.id) : []), [objective, state.results]);
  const latestLoot = useMemo(
    () => state.objectiveLoot.filter((item) => item.objectiveId === objectiveId).sort((left, right) => right.submittedAt.localeCompare(left.submittedAt))[0],
    [objectiveId, state.objectiveLoot],
  );
  const latestTrialReview = useMemo(
    () => latestObjectiveTrialReview(objectiveId ?? "", state.objectiveTrialReviews),
    [objectiveId, state.objectiveTrialReviews],
  );
  const latestAcceptanceAlignment = useMemo(
    () => latestObjectiveAlignmentRequest(objectiveId ?? "", "acceptance", state.objectiveAlignmentRequests),
    [objectiveId, state.objectiveAlignmentRequests],
  );
  const openAcceptanceAlignment = useMemo(
    () => latestOpenObjectiveAlignmentRequest(objectiveId ?? "", "acceptance", state.objectiveAlignmentRequests),
    [objectiveId, state.objectiveAlignmentRequests],
  );
  const [body, setBody] = useState("");
  const [selfTestReportBody, setSelfTestReportBody] = useState("");
  const [claims, setClaims] = useState<Record<string, { claim: LootResultClaimStatus; evidenceText: string }>>({});
  const [resultReviews, setResultReviews] = useState<Record<string, ResultAcceptedResult>>({});
  const [contributionInputs, setContributionInputs] = useState<Record<string, string>>({});
  const [resolutionInputs, setResolutionInputs] = useState<Record<string, string>>({});
  const [resolutionReason, setResolutionReason] = useState("");
  const [reason, setReason] = useState("");
  const [trialDecision, setTrialDecision] = useState<Exclude<ObjectiveTrialReviewStatus, "requested">>("approved");
  const [trialFeedback, setTrialFeedback] = useState("");
  const [error, setError] = useState("");
  const [submittingAction, setSubmittingAction] = useState<"loot" | "trialReview" | "trialResponse" | "peerReview" | "review" | "alignment" | null>(null);

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
    setContributionInputs((current) => percentInputDefaults(objective?.challengers ?? [], current));
    setResolutionInputs((current) => percentInputDefaults(objective?.challengers ?? [], current));
  }, [objective?.challengers]);

  if (!objective) {
    return dataReady ? <Navigate to="/tasks" replace /> : <PageScaffold title="加载中" subtitle="正在加载目标数据。"><Card className="orf-card-padding text-sm orf-text-secondary">正在加载。</Card></PageScaffold>;
  }

  if (!canViewObjectiveRecord(objective, currentUser)) {
    return <Navigate to="/tasks" replace />;
  }

  const currentMember = currentUser?.name ?? "";
  const isChallenger = currentUser?.role === "member" && objective.challengers.includes(currentMember);
  const canSubmit = canSubmitObjectiveLootByFlow(objective) && isChallenger;
  const canReview = Boolean(currentUser?.role === "admin" && canReviewObjectiveLootByFlow(objective) && latestLoot);
  const canRequestTrial = canRequestObjectiveTrialReview(objective, currentUser, latestTrialReview);
  const canReviewTrial = canReviewObjectiveTrialReview(objective, currentUser, latestTrialReview);
  const canPeerReview = canSubmitObjectiveContributionReviewByFlow(objective) && isChallenger;
  const canRequestAcceptanceAlignment = canRequestObjectiveAlignment(objective, currentUser, "acceptance", openAcceptanceAlignment);
  const usesLocalContributionSettlement = objective.challengers.length > 1;
  const needsContributionResolution = usesLocalContributionSettlement;
  const objectiveReviewResult = objectiveAcceptedResultFromReviews(results.map((result) => resultReviews[result.id] ?? "completed"));

  const buildLootSubmission = (): { body: string; resultClaims: LootResultClaim[] } | null => {
    const value = body.trim();
    if (!value) {
      setError("请填写完成说明");
      return null;
    }
    if (results.length === 0) {
      setError("这个目标没有可验收的指标");
      return null;
    }

    const resultClaims = results.map((result) => ({
      resultId: result.id,
      claim: claims[result.id]?.claim ?? "completed",
      evidenceText: claims[result.id]?.evidenceText?.trim() ?? "",
    }));
    const missingEvidence = resultClaims.find((claim) => claim.claim !== "notClaimed" && !claim.evidenceText);
    if (missingEvidence) {
      setError("请填写每个已声明指标的证据、数据或链接");
      return null;
    }

    return { body: value, resultClaims };
  };

  const submit = async () => {
    if (submittingAction) return;
    if (!canSubmit) {
      setError("目标冻结后，挑战者才能提交战利品");
      return;
    }
    const submission = buildLootSubmission();
    if (!submission) return;

    setSubmittingAction("loot");
    try {
      const ok = await submitLoot({
        objectiveId: objective.id,
        body: submission.body,
        author: currentUser?.name,
        selfTestReportBody: selfTestReportBody.trim() || null,
        resultClaims: submission.resultClaims,
      });
      if (ok) navigate("/tasks");
    } finally {
      setSubmittingAction(null);
    }
  };

  const requestTrialReview = async () => {
    if (submittingAction) return;
    if (!canRequestTrial) {
      setError("冻结阶段的挑战者只能发起一次试验收");
      return;
    }
    const submission = buildLootSubmission();
    if (!submission) return;

    setSubmittingAction("trialReview");
    try {
      const ok = await submitObjectiveTrialReview({
        objectiveId: objective.id,
        body: submission.body,
        author: currentUser?.name,
        selfTestReportBody: selfTestReportBody.trim() || null,
        resultClaims: submission.resultClaims,
      });
      if (ok) navigate("/tasks");
    } finally {
      setSubmittingAction(null);
    }
  };

  const respondTrialReview = async () => {
    if (submittingAction) return;
    if (!canReviewTrial || !latestTrialReview) {
      setError("只有指挥官能处理待反馈的试验收");
      return;
    }
    const feedback = trialFeedback.trim();
    if (!feedback) {
      setError("请填写试验收反馈");
      return;
    }

    setSubmittingAction("trialResponse");
    try {
      const ok = await reviewObjectiveTrialReview(objective.id, latestTrialReview.id, {
        status: trialDecision,
        commanderFeedback: feedback,
      });
      if (ok) navigate("/tasks");
    } finally {
      setSubmittingAction(null);
    }
  };

  const review = async () => {
    if (submittingAction) return;
    if (!canReview || !latestLoot) {
      setError("只有指挥官能验收已提交的战利品");
      return;
    }

    const manualResolutionReason = resolutionReason.trim();
    const shouldUseManualResolution = needsContributionResolution && Boolean(manualResolutionReason);
    const resolutionResult = shouldUseManualResolution ? percentInputsToAllocations(resolutionInputs, objective.challengers) : null;
    if (resolutionResult?.status === "invalid") {
      setError(resolutionResult.error);
      return;
    }
    const contributionResolution =
      resolutionResult?.status === "ok"
        ? {
            ratios: resolutionResult.allocations,
            reason: manualResolutionReason,
          }
        : undefined;

    setSubmittingAction("review");
    try {
      const ok = await reviewObjectiveLoot(objective.id, {
        lootId: latestLoot.id,
        reason: reason.trim() || undefined,
        resultReviews: results.map((result) => ({
          resultId: result.id,
          acceptedResult: resultReviews[result.id] ?? "completed",
        })),
        contributionResolution,
      });
      if (ok) navigate("/reports");
    } finally {
      setSubmittingAction(null);
    }
  };

  const submitPeerReview = async () => {
    if (submittingAction) return;
    const result = percentInputsToAllocations(contributionInputs, objective.challengers);
    if (!canPeerReview) {
      setError("目标提交后，挑战者才能提交匿名互评");
      return;
    }
    if (result.status === "invalid") {
      setError(result.error);
      return;
    }

    setSubmittingAction("peerReview");
    try {
      const ok = await submitContributionReview(objective.id, result.allocations);
      if (ok) navigate("/tasks");
    } finally {
      setSubmittingAction(null);
    }
  };

  const requestAcceptanceAlignment = async () => {
    if (submittingAction) return;
    if (!canRequestAcceptanceAlignment) {
      setError("当前状态不能申请验收对齐");
      return;
    }

    setSubmittingAction("alignment");
    try {
      await requestObjectiveAlignment(objective.id, {
        kind: "acceptance",
        note: "请和指挥官约验收时间，并定好会议室。",
      });
    } finally {
      setSubmittingAction(null);
    }
  };

  return (
    <PageScaffold
      title={canReview ? "验收战利品" : canReviewTrial ? "处理试验收" : canPeerReview ? "提交匿名互评" : "提交战利品"}
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

        {latestTrialReview && (
          <Card className="orf-card-padding">
            <div className="grid gap-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-semibold orf-text-primary">试验收</div>
                <span className="orf-status-tag border orf-border orf-surface-muted px-2 py-0.5 text-xs font-semibold orf-text-secondary">
                  {objectiveTrialReviewStatusLabel(latestTrialReview.status)}
                </span>
              </div>
              <div className="orf-text-secondary whitespace-pre-wrap">{latestTrialReview.body}</div>
              {latestTrialReview.selfTestReportBody && <div className="rounded-md border orf-border p-3 text-xs orf-text-secondary whitespace-pre-wrap">{latestTrialReview.selfTestReportBody}</div>}
              {latestTrialReview.commanderFeedback && (
                <div className="rounded-md border orf-border orf-surface-muted p-3 text-xs orf-text-secondary whitespace-pre-wrap">
                  {latestTrialReview.commanderFeedback}
                </div>
              )}
            </div>
          </Card>
        )}

        {(latestAcceptanceAlignment || canRequestAcceptanceAlignment || canReview) && (
          <Card className="orf-card-padding">
            <div className="grid gap-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-semibold orf-text-primary">验收对齐</div>
                {latestAcceptanceAlignment && (
                  <span className="orf-status-tag border orf-border orf-surface-muted px-2 py-0.5 text-xs font-semibold orf-text-secondary">
                    {objectiveAlignmentRequestStatusLabel(latestAcceptanceAlignment.status)}
                  </span>
                )}
              </div>
              <div className="orf-text-secondary">验收前请挑战者和指挥官约好时间，并定好会议室。</div>
              {latestAcceptanceAlignment?.meetingRoom && <div className="text-xs orf-text-secondary">会议室：{latestAcceptanceAlignment.meetingRoom}</div>}
              {latestAcceptanceAlignment?.commanderFeedback && (
                <div className="rounded-md border orf-border orf-surface-muted p-3 text-xs orf-text-secondary whitespace-pre-wrap">
                  {latestAcceptanceAlignment.commanderFeedback}
                </div>
              )}
              {canRequestAcceptanceAlignment && (
                <div>
                  <Button type="button" variant="secondary" disabled={submittingAction === "alignment"} onClick={() => void requestAcceptanceAlignment()}>
                    申请验收对齐
                  </Button>
                </div>
              )}
            </div>
          </Card>
        )}

        {canReview ? (
          <Card className="orf-card-padding">
            <form
              className="grid gap-5"
              onSubmit={(event) => {
                event.preventDefault();
                void review();
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
                {usesLocalContributionSettlement ? <LocalSettlementSummaryView /> : <SingleContributionSummaryView member={objective.challengers[0] ?? currentMember} />}
                {needsContributionResolution && (
                  <div className="grid gap-3 rounded-md border orf-border p-3">
                    <div className="text-sm font-semibold orf-text-primary">处理分歧</div>
                    <div className="text-xs orf-text-secondary">默认优先使用本地结算服务的匿名互评结果；只有需要手动处理时，填写最终贡献百分比和说明。</div>
                    <ContributionPercentTotal total={percentInputTotal(resolutionInputs, objective.challengers)} />
                    {objective.challengers.map((member) => (
                      <Field key={member} label={`${member} 处理后贡献百分比`}>
                        <input className="orf-input px-3 py-2 text-sm" type="number" min="0" max="100" step="0.01" inputMode="decimal" value={resolutionInputs[member] ?? "0"} onChange={(event) => { setResolutionInputs((items) => ({ ...items, [member]: event.target.value })); if (error) setError(""); }} />
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
                <Button type="submit" disabled={submittingAction === "review"}>验收并结算</Button>
              </div>
            </form>
          </Card>
        ) : canReviewTrial && latestTrialReview ? (
          <Card className="orf-card-padding">
            <form
              className="grid gap-5"
              onSubmit={(event) => {
                event.preventDefault();
                void respondTrialReview();
              }}
            >
              <div className="grid gap-3">
                {latestTrialReview.resultClaims.map((claim) => (
                  <div key={claim.resultId} className="grid gap-2 rounded-md border orf-border p-3">
                    <div className="text-sm font-semibold orf-text-primary">{results.find((result) => result.id === claim.resultId)?.title ?? claim.resultId}</div>
                    <div className="text-xs font-semibold orf-text-secondary">{lootClaimLabel(claim.claim)}</div>
                    {claim.evidenceText && <div className="text-sm orf-text-secondary whitespace-pre-wrap">{claim.evidenceText}</div>}
                  </div>
                ))}
              </div>
              <Field label="试验收结论">
                <select className="orf-input px-3 py-2 text-sm" value={trialDecision} onChange={(event) => setTrialDecision(event.target.value as Exclude<ObjectiveTrialReviewStatus, "requested">)}>
                  <option value="approved">可正式提交</option>
                  <option value="needsWork">需补充</option>
                </select>
              </Field>
              <Field label="反馈说明">
                <textarea className="orf-input min-h-24 px-3 py-2 text-sm" value={trialFeedback} onChange={(event) => { setTrialFeedback(event.target.value); if (error) setError(""); }} />
              </Field>
              {error && <div className="text-sm orf-danger-text">{error}</div>}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => navigate("/tasks")}>取消</Button>
                <Button type="submit" disabled={submittingAction === "trialResponse"}>提交反馈</Button>
              </div>
            </form>
          </Card>
        ) : canPeerReview ? (
          <Card className="orf-card-padding">
            <form
              className="grid gap-5"
              onSubmit={(event) => {
                event.preventDefault();
                void submitPeerReview();
              }}
            >
              <div className="text-sm orf-text-secondary">
                评价当前目标挑战者的贡献比例，提交后会加密发送到本地结算服务；再次提交会作为最新评价参与汇总。
              </div>
              <div className="rounded-md border orf-border orf-surface-muted p-3 text-xs orf-text-secondary">
                给每位目标挑战者填写 0-100 的贡献百分比，合计必须为 100%。需要包含自己；自评只用于一致性核查，结算得分只汇总其他挑战者对该成员的评价。
              </div>
              <ContributionPercentTotal total={percentInputTotal(contributionInputs, objective.challengers)} />
              <div className="grid gap-3">
                {objective.challengers.map((member) => (
                  <Field key={member} label={`${member}${member === currentMember ? "（你）" : ""} 贡献百分比`}>
                    <input className="orf-input px-3 py-2 text-sm" type="number" min="0" max="100" step="0.01" inputMode="decimal" value={contributionInputs[member] ?? "0"} onChange={(event) => { setContributionInputs((items) => ({ ...items, [member]: event.target.value })); if (error) setError(""); }} />
                  </Field>
                ))}
              </div>
              {error && <div className="text-sm orf-danger-text">{error}</div>}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => navigate("/tasks")}>取消</Button>
                <Button type="submit" disabled={submittingAction === "peerReview"}>提交匿名互评</Button>
              </div>
            </form>
          </Card>
        ) : canSubmit ? (
          <Card className="orf-card-padding">
            <form
              className="grid gap-5"
              onSubmit={(event) => {
                event.preventDefault();
                void submit();
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
                <textarea className="orf-input min-h-24 px-3 py-2 text-sm" placeholder="记录自测覆盖、复核结论或风险说明" value={selfTestReportBody} onChange={(event) => setSelfTestReportBody(event.target.value)} />
              </Field>
              {error && <div className="text-sm orf-danger-text">{error}</div>}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => navigate("/tasks")}>取消</Button>
                {canRequestTrial && (
                  <Button type="button" variant="secondary" disabled={submittingAction === "trialReview"} onClick={() => void requestTrialReview()}>
                    <ClipboardCheck className="h-4 w-4" />
                    提交试验收
                  </Button>
                )}
                <Button type="submit" disabled={!canSubmit || submittingAction === "loot"}>
                  <Send className="h-4 w-4" />
                  正式提交
                </Button>
              </div>
            </form>
          </Card>
        ) : (
          <Card className="orf-card-padding text-sm orf-text-secondary">当前状态没有可提交的验收动作。</Card>
        )}
      </div>
    </PageScaffold>
  );
}

function LocalSettlementSummaryView() {
  return (
    <div className="grid gap-2 rounded-md border orf-border orf-surface-muted p-3 text-sm">
      <div className="orf-text-secondary">验收时从本地结算服务读取匿名互评汇总。</div>
    </div>
  );
}

function SingleContributionSummaryView({ member }: { member: string }) {
  return (
    <div className="grid gap-2 rounded-md border orf-border orf-surface-muted p-3 text-sm">
      <div className="flex justify-between gap-3">
        <span className="orf-text-primary">{member}</span>
        <span className="orf-text-secondary">100%</span>
      </div>
    </div>
  );
}

function ContributionPercentTotal({ total }: { total: number }) {
  const valid = Math.abs(total - CONTRIBUTION_PERCENT_TOTAL) <= CONTRIBUTION_PERCENT_TOLERANCE;
  return (
    <div className={valid ? "text-xs orf-text-secondary" : "text-xs orf-warning-text"}>
      当前合计：{formatInputPercent(total)}%
    </div>
  );
}

function percentInputDefaults(members: string[], current: Record<string, string>) {
  const next: Record<string, string> = {};
  const defaults = balancedPercentDefaults(members);
  for (const member of members) {
    next[member] = current[member] ?? defaults[member] ?? "0";
  }
  return next;
}

function balancedPercentDefaults(members: string[]) {
  if (members.length === 0) return {};
  const next: Record<string, string> = {};
  const base = Number((CONTRIBUTION_PERCENT_TOTAL / members.length).toFixed(2));
  let assigned = 0;
  members.forEach((member, index) => {
    const value = index === members.length - 1 ? CONTRIBUTION_PERCENT_TOTAL - assigned : base;
    assigned += value;
    next[member] = formatInputPercent(value);
  });
  return next;
}

function percentInputsToAllocations(values: Record<string, string>, members: string[]) {
  const allocations: ContributionAllocation[] = [];
  for (const member of members) {
    const rawValue = values[member]?.trim();
    if (!rawValue) {
      return { status: "invalid" as const, error: "请填写每个挑战者的贡献百分比" };
    }
    const percent = Number(rawValue);
    if (!Number.isFinite(percent) || percent < 0 || percent > CONTRIBUTION_PERCENT_TOTAL) {
      return { status: "invalid" as const, error: "贡献百分比必须在 0 到 100 之间" };
    }
    allocations.push({ member, ratio: percent / CONTRIBUTION_PERCENT_TOTAL });
  }

  const total = allocations.reduce((sum, item) => sum + item.ratio, 0) * CONTRIBUTION_PERCENT_TOTAL;
  if (Math.abs(total - CONTRIBUTION_PERCENT_TOTAL) > CONTRIBUTION_PERCENT_TOLERANCE) {
    return { status: "invalid" as const, error: "贡献百分比合计必须为 100%" };
  }

  return { status: "ok" as const, allocations };
}

function percentInputTotal(values: Record<string, string>, members: string[]) {
  return members.reduce((sum, member) => {
    const value = Number(values[member] ?? 0);
    return Number.isFinite(value) ? sum + value : sum;
  }, 0);
}

function objectiveReviewResultLabel(value: ReturnType<typeof objectiveAcceptedResultFromReviews>) {
  if (value === "completed") return "全部指标完成，目标完成。";
  if (value === "falsified") return "指标全部有效证伪，目标按有效证伪结算。";
  return "存在未完成、失败或未验收指标，目标不按完成结算。";
}

function lootClaimLabel(value: LootResultClaimStatus) {
  return lootClaimOptions.find((option) => option.value === value)?.label ?? value;
}

function formatInputPercent(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}
