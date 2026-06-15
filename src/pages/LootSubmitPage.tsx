import { ArrowLeft, ClipboardCheck, Send } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { FantasySelectMenu, type FantasySelectOption } from "../components/FantasySelectMenu";
import { PageScaffold } from "../components/PageScaffold";
import { Button, Card, Field } from "../components/ui";
import { fetchLocalSettlementSummary, type LocalSettlementSummary } from "../services/localSettlementClient";
import { canViewObjectiveRecord } from "../features/challenge/model/objectiveVisibility";
import { useOrf } from "../state/OrfProvider";
import {
  canReviewObjectiveLootByFlow,
  canSettleObjectiveLootByFlow,
  canSubmitObjectiveContributionReviewByFlow,
  canSubmitObjectiveLootByFlow,
} from "../domain/orfLifecycle";
import {
  canRequestObjectiveTrialReview,
  canReviewObjectiveTrialReview,
  latestObjectiveTrialReview,
  objectiveTrialReviewStatusLabel,
} from "../domain/orfTrialReview";
import {
  isObjectiveChallenger,
  objectiveChallengerTargets,
  type ContributionMemberTarget,
} from "../domain/orfObjectiveParticipants";
import { resultDetailText } from "../domain/orfResultDetails";
import { objectiveAcceptedResultFromReviews } from "../domain/orfSettlement";
import type {
  ContributionAllocation,
  LootResultClaim,
  LootResultClaimStatus,
  ObjectiveLoot,
  ObjectiveTrialReviewStatus,
  Result,
  ResultAcceptedResult,
} from "../types/orf";

const lootClaimOptions: Array<FantasySelectOption<LootResultClaimStatus>> = [
  { label: "完成", value: "completed" },
  { label: "证伪", value: "falsified" },
  { label: "未主张", value: "notClaimed" },
];

const resultReviewOptions: Array<FantasySelectOption<ResultAcceptedResult>> = [
  { label: "完成", value: "completed" },
  { label: "证伪", value: "falsified" },
  { label: "失败", value: "failed" },
  { label: "不验收", value: "unreviewed" },
];

const reviewDecisionOptions: Array<FantasySelectOption<"passed" | "notPassed">> = [
  { label: "通过", value: "passed" },
  { label: "不通过", value: "notPassed" },
];

const trialDecisionOptions: Array<FantasySelectOption<Exclude<ObjectiveTrialReviewStatus, "requested">>> = [
  { label: "可正式提交", value: "approved" },
  { label: "需补充", value: "needsWork" },
];

const CONTRIBUTION_PERCENT_TOTAL = 100;
const CONTRIBUTION_PERCENT_TOLERANCE = 0.01;
const CONTRIBUTION_RATIO_WARNING_THRESHOLD = 0.1;

function ResultDetailsSummary({ result }: { result: Result }) {
  const detail = resultDetailText(result);
  if (!detail) return null;

  return (
    <div className="rounded-md border orf-border orf-surface-muted p-3 text-xs whitespace-pre-wrap leading-5 orf-text-secondary">
      {detail}
    </div>
  );
}

export function LootSubmitPage() {
  const { objectiveId } = useParams();
  const navigate = useNavigate();
  const {
    currentUser,
    dataReady,
    reviewObjectiveLoot,
    reviewObjectiveTrialReview,
    settleObjectiveLoot,
    state,
    submitContributionReview,
    submitLoot,
    submitObjectiveTrialReview,
  } = useOrf();
  const objective = state.objectives.find((item) => item.id === objectiveId);
  const results = useMemo(
    () =>
      objective
        ? state.results.filter((result) => result.objectiveId === objective.id)
        : [],
    [objective, state.results],
  );
  const latestLoot = useMemo(
    () =>
      state.objectiveLoot
        .filter((item) => item.objectiveId === objectiveId)
        .sort((left, right) =>
          right.submittedAt.localeCompare(left.submittedAt),
        )[0],
    [objectiveId, state.objectiveLoot],
  );
  const latestTrialReview = useMemo(
    () =>
      latestObjectiveTrialReview(
        objectiveId ?? "",
        state.objectiveTrialReviews,
      ),
    [objectiveId, state.objectiveTrialReviews],
  );
  const challengerAllocationTargets = useMemo(
    () => (objective ? objectiveChallengerTargets(objective) : []),
    [objective],
  );
  const [body, setBody] = useState("");
  const [selfTestReportBody, setSelfTestReportBody] = useState("");
  const [claims, setClaims] = useState<
    Record<string, { claim: LootResultClaimStatus; evidenceText: string }>
  >({});
  const [resultReviews, setResultReviews] = useState<
    Record<string, ResultAcceptedResult>
  >({});
  const [contributionInputs, setContributionInputs] = useState<
    Record<string, string>
  >({});
  const [peerReviewMode, setPeerReviewMode] = useState<"score" | "abstain">("score");
  const [abstentionReason, setAbstentionReason] = useState("");
  const [resolutionInputs, setResolutionInputs] = useState<
    Record<string, string>
  >({});
  const [resolutionEdited, setResolutionEdited] = useState(false);
  const [resolutionReason, setResolutionReason] = useState("");
  const [settlementSummary, setSettlementSummary] = useState<LocalSettlementSummary | null>(null);
  const [settlementSummaryError, setSettlementSummaryError] = useState("");
  const [settlementSummaryLoading, setSettlementSummaryLoading] = useState(false);
  const [reason, setReason] = useState("");
  const [reviewDecision, setReviewDecision] = useState<"passed" | "notPassed">("passed");
  const [trialDecision, setTrialDecision] =
    useState<Exclude<ObjectiveTrialReviewStatus, "requested">>("approved");
  const [trialFeedback, setTrialFeedback] = useState("");
  const [error, setError] = useState("");
  const [submittingAction, setSubmittingAction] = useState<
    | "loot"
    | "trialReview"
    | "trialResponse"
    | "peerReview"
    | "review"
    | "settle"
    | null
  >(null);

  useEffect(() => {
    setClaims((current) => {
      const next: typeof current = {};
      for (const result of results) {
        next[result.id] = current[result.id] ?? {
          claim: "completed",
          evidenceText: "",
        };
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
    setContributionInputs((current) =>
      percentInputDefaults(objective?.challengers ?? [], current),
    );
  }, [objective?.challengers]);

  const settlementContributionTargets = challengerAllocationTargets;
  const settlementParticipantUserIds = useMemo(
    () =>
      settlementContributionTargets
        .map((target) => target.memberUserId)
        .filter((userId): userId is string => Boolean(userId)),
    [settlementContributionTargets],
  );
  const settlementParticipantNames = useMemo(
    () => settlementContributionTargets.map((target) => target.member),
    [settlementContributionTargets],
  );
  const usesLocalContributionSettlement = settlementContributionTargets.length > 1;
  const needsContributionResolution = usesLocalContributionSettlement;
  const canLoadSettlementSummary = Boolean(
    currentUser?.role === "admin" &&
    objective &&
    canSettleObjectiveLootByFlow(objective) &&
    latestLoot &&
    usesLocalContributionSettlement,
  );
  const reviewedResultValues = useMemo(
    () =>
      reviewDecision === "notPassed"
        ? results.map(() => "failed" as ResultAcceptedResult)
        : results.map((result) => resultReviews[result.id] ?? "completed"),
    [reviewDecision, resultReviews, results],
  );
  const objectiveReviewResult = reviewDecision === "notPassed"
    ? "abandoned"
    : objectiveAcceptedResultFromReviews(reviewedResultValues);

  useEffect(() => {
    setResolutionEdited(false);
  }, [settlementParticipantNames]);

  useEffect(() => {
    if (!canLoadSettlementSummary || !objective) {
      setSettlementSummary(null);
      setSettlementSummaryError("");
      return;
    }

    let cancelled = false;
    setSettlementSummary(null);
    setSettlementSummaryLoading(true);
    setSettlementSummaryError("");
    void fetchLocalSettlementSummary({
      objectiveId: objective.id,
      participantUserIds: settlementParticipantUserIds,
    })
      .then((summary) => {
        if (cancelled) return;
        setSettlementSummary(summary);
      })
      .catch((summaryError) => {
        if (cancelled) return;
        setSettlementSummary(null);
        setSettlementSummaryError(
          summaryError instanceof Error
            ? summaryError.message
            : "匿名互评数据读取失败",
        );
      })
      .finally(() => {
        if (!cancelled) setSettlementSummaryLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    canLoadSettlementSummary,
    objective?.id,
    settlementParticipantUserIds,
  ]);

  useEffect(() => {
    if (resolutionEdited) return;
    setResolutionInputs((current) =>
      settlementSummary
        ? percentInputDefaultsFromRatios(settlementContributionTargets, settlementSummary.ratios, current)
        : percentInputDefaults(settlementParticipantNames, current),
    );
  }, [
    resolutionEdited,
    settlementContributionTargets,
    settlementParticipantNames,
    settlementSummary,
  ]);

  const settlementDefaultInputs = useMemo(
    () =>
      settlementSummary
        ? percentInputDefaultsFromRatios(settlementContributionTargets, settlementSummary.ratios, {})
        : percentInputDefaults(settlementParticipantNames, {}),
    [settlementContributionTargets, settlementParticipantNames, settlementSummary],
  );

  if (!objective) {
    return dataReady ? (
      <Navigate to="/tasks" replace />
    ) : (
      <PageScaffold title="加载中" subtitle="正在加载目标数据。">
        <Card className="orf-card-padding text-sm orf-text-secondary">
          正在加载。
        </Card>
      </PageScaffold>
    );
  }

  if (!canViewObjectiveRecord(objective, currentUser)) {
    return <Navigate to="/tasks" replace />;
  }

  const currentMemberId = currentUser?.id ?? "";
  const currentMemberName = currentUser?.name ?? "";
  const isChallenger =
    currentUser?.role === "member" &&
    isObjectiveChallenger(objective, currentMemberId);
  const canSubmit = canSubmitObjectiveLootByFlow(objective) && isChallenger;
  const canReview = Boolean(
    currentUser?.role === "admin" &&
    canReviewObjectiveLootByFlow(objective) &&
    latestLoot,
  );
  const canSettle = Boolean(
    currentUser?.role === "admin" &&
    canSettleObjectiveLootByFlow(objective) &&
    latestLoot,
  );
  const canRequestTrial = canRequestObjectiveTrialReview(
    objective,
    currentUser,
    latestTrialReview,
  );
  const canReviewTrial = canReviewObjectiveTrialReview(
    objective,
    currentUser,
    latestTrialReview,
  );
  const canPeerReview =
    canSubmitObjectiveContributionReviewByFlow(objective) && isChallenger;

  const resetResolutionInputsToDefaults = () => {
    setResolutionInputs(settlementDefaultInputs);
    setResolutionEdited(false);
    if (error) setError("");
  };
  const buildLootSubmission = (): {
    body: string;
    resultClaims: LootResultClaim[];
  } | null => {
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
    const missingEvidence = resultClaims.find(
      (claim) => claim.claim !== "notClaimed" && !claim.evidenceText,
    );
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
      const ok = await reviewObjectiveTrialReview(
        objective.id,
        latestTrialReview.id,
        {
          status: trialDecision,
          commanderFeedback: feedback,
        },
      );
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

    if (reviewDecision === "passed" && objectiveReviewResult === "abandoned") {
      setError("通过验收时，指标验收结果不能包含失败或不验收");
      return;
    }

    setSubmittingAction("review");
    try {
      const ok = await reviewObjectiveLoot(objective.id, {
        acceptedResult: objectiveReviewResult,
        lootId: latestLoot.id,
        reason: reason.trim() || undefined,
        resultReviews: results.map((result, index) => ({
          resultId: result.id,
          acceptedResult: reviewedResultValues[index] ?? "failed",
        })),
      });
      if (ok) navigate("/tasks");
    } finally {
      setSubmittingAction(null);
    }
  };

  const settle = async () => {
    if (submittingAction) return;
    if (!canSettle || !latestLoot) {
      setError("只有指挥官能结算已验收的战利品");
      return;
    }
    if (settlementContributionTargets.length === 0) {
      setError("缺少可结算的参与人");
      return;
    }

    const finalResolutionReason =
      resolutionReason.trim() ||
      defaultContributionResolutionReason(settlementSummary);
    const resolutionResult = needsContributionResolution
      ? percentInputsToAllocations(
          resolutionInputs,
          settlementContributionTargets,
        )
      : null;
    if (resolutionResult?.status === "invalid") {
      setError(resolutionResult.error);
      return;
    }
    const contributionResolution = contributionResolutionForSettlement({
      reason: finalResolutionReason,
      resolutionResult,
      settlementTargets: settlementContributionTargets,
    });

    setSubmittingAction("settle");
    try {
      const ok = await settleObjectiveLoot(objective.id, {
        contributionResolution,
        lootId: latestLoot.id,
        reason: finalResolutionReason,
        settlementParticipantUserIds,
      });
      if (ok) navigate("/reports");
    } finally {
      setSubmittingAction(null);
    }
  };

  const submitPeerReview = async () => {
    if (submittingAction) return;
    if (!canPeerReview) {
      setError("目标已验收后，挑战者才能提交匿名互评");
      return;
    }
    if (peerReviewMode === "abstain") {
      const note = abstentionReason.trim();
      if (!note) {
        setError("请简述你做了什么，以及为什么弃权");
        return;
      }

      setSubmittingAction("peerReview");
      try {
        const ok = await submitContributionReview(
          objective.id,
          { abstentionReason: note, kind: "abstain" },
        );
        if (ok) navigate("/tasks");
      } finally {
        setSubmittingAction(null);
      }
      return;
    }

    const result = percentInputsToAllocations(
      contributionInputs,
      challengerAllocationTargets,
    );
    if (result.status === "invalid") {
      setError(result.error);
      return;
    }

    setSubmittingAction("peerReview");
    try {
      const ok = await submitContributionReview(
        objective.id,
        { allocations: result.allocations, kind: "score" },
      );
      if (ok) navigate("/tasks");
    } finally {
      setSubmittingAction(null);
    }
  };

  return (
    <PageScaffold
      title={
        canReview
          ? "验收战利品"
          : canSettle
            ? "确认结算"
            : canReviewTrial
              ? "处理试验收"
              : canPeerReview
                ? "提交匿名互评"
                : "提交战利品"
      }
      subtitle={`目标：${objective.title}`}
      action={
        <Link
          className="orf-control orf-secondary-action inline-flex items-center gap-2 border px-3 py-2 text-sm font-medium"
          to="/tasks"
        >
          <ArrowLeft className="h-4 w-4" />
          返回挑战
        </Link>
      }
    >
      <div className="orf-loot-page-grid">
        <Card className="orf-card-padding">
          <div className="grid gap-2">
            <div className="text-xs font-medium orf-text-muted">
              悬赏目标标题
            </div>
            <div className="rounded-md border orf-border orf-surface-muted px-3 py-2 text-sm font-semibold orf-text-primary">
              {objective.title}
            </div>
          </div>
        </Card>

        {latestLoot && !canReview && !canSettle && !canPeerReview && (
          <Card className="orf-card-padding">
            <div className="grid gap-3 text-sm">
              <div className="font-semibold orf-text-primary">最近提交</div>
              <div className="orf-text-secondary whitespace-pre-wrap">
                {latestLoot.body}
              </div>
              {latestLoot.selfTestReportBody && (
                <div className="rounded-md border orf-border p-3 text-xs orf-text-secondary whitespace-pre-wrap">
                  {latestLoot.selfTestReportBody}
                </div>
              )}
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
              <div className="orf-text-secondary whitespace-pre-wrap">
                {latestTrialReview.body}
              </div>
              {latestTrialReview.selfTestReportBody && (
                <div className="rounded-md border orf-border p-3 text-xs orf-text-secondary whitespace-pre-wrap">
                  {latestTrialReview.selfTestReportBody}
                </div>
              )}
              {latestTrialReview.commanderFeedback && (
                <div className="rounded-md border orf-border orf-surface-muted p-3 text-xs orf-text-secondary whitespace-pre-wrap">
                  {latestTrialReview.commanderFeedback}
                </div>
              )}
            </div>
          </Card>
        )}

        {canReview ? (
          <Card className="orf-loot-review-card orf-card-padding">
            <form
              className="orf-loot-review-form"
              onSubmit={(event) => {
                event.preventDefault();
                void review();
              }}
            >
              {latestLoot && (
                <LootSubmissionReviewPanel
                  loot={latestLoot}
                  results={results}
                />
              )}
              <div className="orf-loot-section">
                <div className="orf-loot-section-heading">
                  <div>
                    <div className="text-sm font-semibold orf-text-primary">
                      指标验收
                    </div>
                    <div className="text-xs orf-text-secondary">
                      按挑战者提交的证据确认每个指标结论。
                    </div>
                  </div>
                  <div className="orf-loot-review-decision">
                    <span>验收结论</span>
                    <FantasySelectMenu
                      ariaLabel="验收结论"
                      className="orf-loot-select orf-loot-compact-select"
                      onChange={(value) => {
                        setReviewDecision(value);
                        if (error) setError("");
                      }}
                      options={reviewDecisionOptions}
                      value={reviewDecision}
                      variant="filter"
                    />
                  </div>
                </div>
                <ResultReviewTable
                  readOnly={reviewDecision === "notPassed"}
                  results={results}
                  values={resultReviews}
                  onChange={(resultId, value) => {
                    setResultReviews((items) => ({
                      ...items,
                      [resultId]: value,
                    }));
                    if (error) setError("");
                  }}
                />
              </div>
              <div className="orf-loot-panel orf-loot-result-summary">
                <div className="font-semibold orf-text-primary">
                  目标验收结果
                </div>
                <div className="orf-text-secondary">
                  {objectiveReviewResultLabel(objectiveReviewResult)}
                </div>
              </div>
              <Field label="验收说明">
                <textarea
                  className="orf-input min-h-24 px-3 py-2 text-sm"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              </Field>
              {error && <div className="text-sm orf-danger-text">{error}</div>}
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => navigate("/tasks")}
                >
                  取消
                </Button>
                <Button type="submit" disabled={submittingAction === "review"}>
                  确认验收
                </Button>
              </div>
            </form>
          </Card>
        ) : canSettle ? (
          <Card className="orf-loot-review-card orf-card-padding">
            <form
              className="orf-loot-review-form"
              onSubmit={(event) => {
                event.preventDefault();
                void settle();
              }}
            >
              <div className="grid gap-3">
                <div className="text-sm font-semibold orf-text-primary">
                  匿名互评贡献结果
                </div>
                {usesLocalContributionSettlement ? (
                  <LocalSettlementSummaryView
                    error={settlementSummaryError}
                    loading={settlementSummaryLoading}
                    summary={settlementSummary}
                    targets={settlementContributionTargets}
                  />
                ) : (
                  <SingleContributionSummaryView
                    member={settlementContributionTargets[0]?.member ?? currentMemberName}
                  />
                )}
                {needsContributionResolution && (
                  <div className="orf-loot-panel orf-loot-settlement-panel">
                    <div className="orf-loot-panel-heading">
                      <div>
                        <div className="text-sm font-semibold orf-text-primary">
                          最终结算比例
                        </div>
                        <div className="text-xs orf-text-secondary">
                          默认来自当前互评平均值。缺评、弃权和偏离只作为提示，指挥官确认合计为 100% 后即可结算。
                        </div>
                      </div>
                      <div className="orf-loot-panel-heading-actions">
                        <span
                          className={
                            isContributionPercentTotalValid(
                              percentInputTotal(
                                resolutionInputs,
                                settlementContributionTargets.map((target) => target.member),
                              ),
                            )
                              ? "orf-loot-total-pill"
                              : "orf-loot-total-pill orf-loot-total-pill-warning"
                          }
                        >
                          合计 {formatInputPercent(percentInputTotal(
                            resolutionInputs,
                            settlementContributionTargets.map((target) => target.member),
                          ))}%
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={resetResolutionInputsToDefaults}
                        >
                          恢复默认
                        </Button>
                      </div>
                    </div>
                    <SettlementResolutionTable
                      defaultInputs={settlementDefaultInputs}
                      targets={settlementContributionTargets}
                      values={resolutionInputs}
                      onChange={(member, value) => {
                        setResolutionInputs((items) => ({
                          ...items,
                          [member]: value,
                        }));
                        setResolutionEdited(true);
                        if (error) setError("");
                      }}
                    />
                    <Field label="结算比例说明（可选）">
                      <textarea
                        className="orf-input min-h-20 px-3 py-2 text-sm"
                        value={resolutionReason}
                        onChange={(event) => {
                          setResolutionReason(event.target.value);
                          if (error) setError("");
                        }}
                      />
                    </Field>
                  </div>
                )}
              </div>
              {error && <div className="text-sm orf-danger-text">{error}</div>}
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => navigate("/tasks")}
                >
                  取消
                </Button>
                <Button type="submit" disabled={submittingAction === "settle"}>
                  确认结算
                </Button>
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
                  <div
                    key={claim.resultId}
                    className="grid gap-2 rounded-md border orf-border p-3"
                  >
                    <div className="text-sm font-semibold orf-text-primary">
                      {results.find((result) => result.id === claim.resultId)
                        ?.title ?? claim.resultId}
                    </div>
                    <div className="text-xs font-semibold orf-text-secondary">
                      {lootClaimLabel(claim.claim)}
                    </div>
                    {claim.evidenceText && (
                      <div className="text-sm orf-text-secondary whitespace-pre-wrap">
                        {claim.evidenceText}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <Field label="试验收结论">
                <FantasySelectMenu
                  ariaLabel="试验收结论"
                  className="orf-loot-select"
                  onChange={(value) => setTrialDecision(value)}
                  options={trialDecisionOptions}
                  value={trialDecision}
                  variant="filter"
                />
              </Field>
              <Field label="反馈说明">
                <textarea
                  className="orf-input min-h-24 px-3 py-2 text-sm"
                  value={trialFeedback}
                  onChange={(event) => {
                    setTrialFeedback(event.target.value);
                    if (error) setError("");
                  }}
                />
              </Field>
              {error && <div className="text-sm orf-danger-text">{error}</div>}
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => navigate("/tasks")}
                >
                  取消
                </Button>
                <Button
                  type="submit"
                  disabled={submittingAction === "trialResponse"}
                >
                  提交反馈
                </Button>
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
                评价当前目标挑战者的贡献比例，提交后会加密并通过 ORF 代理发送到共享结算服务；再次提交会作为最新评价参与汇总。
              </div>
              <div className="grid gap-2 rounded-md border orf-border p-3 text-sm">
                <label className="flex items-start gap-2 orf-text-primary">
                  <input
                    type="radio"
                    checked={peerReviewMode === "score"}
                    onChange={() => {
                      setPeerReviewMode("score");
                      if (error) setError("");
                    }}
                  />
                  <span>
                    我了解本次贡献情况，提交贡献百分比
                  </span>
                </label>
                <label className="flex items-start gap-2 orf-text-primary">
                  <input
                    type="radio"
                    checked={peerReviewMode === "abstain"}
                    onChange={() => {
                      setPeerReviewMode("abstain");
                      if (error) setError("");
                    }}
                  />
                  <span>
                    我参与很少或不了解整体贡献，提交弃权说明
                  </span>
                </label>
              </div>
              {peerReviewMode === "score" ? (
                <>
                  <div className="rounded-md border orf-border orf-surface-muted p-3 text-xs orf-text-secondary">
                    给每位目标挑战者填写 0-100 的贡献百分比，合计必须为
                    100%。需要包含自己；自评只用于一致性核查，结算得分优先汇总其他挑战者对该成员的评价。
                  </div>
                  <ContributionPercentTotal
                    total={percentInputTotal(
                      contributionInputs,
                      objective.challengers,
                    )}
                  />
                  <div className="grid gap-3">
                    {objective.challengers.map((member) => (
                      <Field
                        key={member}
                        label={`${member}${member === currentMemberName ? "（你）" : ""} 贡献百分比`}
                      >
                        <input
                          className="orf-input px-3 py-2 text-sm"
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          inputMode="decimal"
                          value={contributionInputs[member] ?? "0"}
                          onChange={(event) => {
                            setContributionInputs((items) => ({
                              ...items,
                              [member]: event.target.value,
                            }));
                            if (error) setError("");
                          }}
                        />
                      </Field>
                    ))}
                  </div>
                </>
              ) : (
                <Field label="弃权说明">
                  <textarea
                    className="orf-input min-h-28 px-3 py-2 text-sm"
                    placeholder="简述你大概做了什么，以及为什么无法判断其他人的贡献比例"
                    value={abstentionReason}
                    onChange={(event) => {
                      setAbstentionReason(event.target.value);
                      if (error) setError("");
                    }}
                  />
                </Field>
              )}
              {error && <div className="text-sm orf-danger-text">{error}</div>}
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => navigate("/tasks")}
                >
                  取消
                </Button>
                <Button
                  type="submit"
                  disabled={submittingAction === "peerReview"}
                >
                  {peerReviewMode === "abstain" ? "提交弃权说明" : "提交匿名互评"}
                </Button>
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
                <textarea
                  className="orf-input min-h-32 px-3 py-2 text-sm"
                  value={body}
                  onChange={(event) => {
                    setBody(event.target.value);
                    if (error) setError("");
                  }}
                  autoFocus
                />
              </Field>
              <div className="grid gap-3">
                {results.map((result) => (
                  <div
                    key={result.id}
                    className="grid gap-2 rounded-md border orf-border p-3"
                  >
                    <div className="text-sm font-semibold orf-text-primary">
                      {result.title}
                    </div>
                    <ResultDetailsSummary result={result} />
                    <FantasySelectMenu
                      ariaLabel={`${result.title} 完成主张`}
                      className="orf-loot-select"
                      onChange={(value) =>
                        setClaims((items) => ({
                          ...items,
                          [result.id]: {
                            ...(items[result.id] ?? { evidenceText: "" }),
                            claim: value,
                          },
                        }))
                      }
                      options={lootClaimOptions}
                      value={claims[result.id]?.claim ?? "completed"}
                      variant="filter"
                    />
                    <textarea
                      className="orf-input min-h-20 px-3 py-2 text-sm"
                      placeholder="证据、数据或链接"
                      value={claims[result.id]?.evidenceText ?? ""}
                      onChange={(event) =>
                        setClaims((items) => ({
                          ...items,
                          [result.id]: {
                            ...(items[result.id] ?? { claim: "completed" }),
                            evidenceText: event.target.value,
                          },
                        }))
                      }
                    />
                  </div>
                ))}
              </div>
              <Field label="自测报告">
                <textarea
                  className="orf-input min-h-24 px-3 py-2 text-sm"
                  placeholder="记录自测覆盖、复核结论或风险说明"
                  value={selfTestReportBody}
                  onChange={(event) =>
                    setSelfTestReportBody(event.target.value)
                  }
                />
              </Field>
              {error && <div className="text-sm orf-danger-text">{error}</div>}
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => navigate("/tasks")}
                >
                  取消
                </Button>
                {canRequestTrial && (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={submittingAction === "trialReview"}
                    onClick={() => void requestTrialReview()}
                  >
                    <ClipboardCheck className="h-4 w-4" />
                    提交试验收
                  </Button>
                )}
                <Button
                  type="submit"
                  disabled={!canSubmit || submittingAction === "loot"}
                >
                  <Send className="h-4 w-4" />
                  正式提交
                </Button>
              </div>
            </form>
          </Card>
        ) : (
          <Card className="orf-card-padding text-sm orf-text-secondary">
            当前状态没有可提交的验收动作。
          </Card>
        )}
      </div>
    </PageScaffold>
  );
}

function LootSubmissionReviewPanel({
  loot,
  results,
}: {
  loot: ObjectiveLoot;
  results: Result[];
}) {
  const resultById = new Map(results.map((result) => [result.id, result]));

  return (
    <div className="orf-loot-panel orf-loot-submission-review">
      <div className="orf-loot-panel-heading">
        <div>
          <div className="text-sm font-semibold orf-text-primary">
            提交内容
          </div>
          <div className="text-xs orf-text-secondary">
            {loot.submittedBy} · {formatSummaryTime(loot.submittedAt)}
          </div>
        </div>
      </div>
      <div className="orf-loot-submission-block">
        <div className="orf-loot-submission-label">完成说明</div>
        <div className="orf-loot-submission-text">
          <LinkifiedText text={loot.body} />
        </div>
      </div>
      {(loot.selfTestReportBody || loot.selfTestReportUrl) && (
        <div className="orf-loot-submission-block">
          <div className="orf-loot-submission-label">自测报告</div>
          {loot.selfTestReportBody && (
            <div className="orf-loot-submission-text">
              <LinkifiedText text={loot.selfTestReportBody} />
            </div>
          )}
          {loot.selfTestReportUrl && (
            <a
              className="orf-loot-link"
              href={loot.selfTestReportUrl}
              rel="noreferrer"
              target="_blank"
            >
              {loot.selfTestReportUrl}
            </a>
          )}
        </div>
      )}
      <div className="orf-loot-table-wrap">
        <table className="orf-loot-table orf-loot-submission-table">
          <thead className="orf-surface-muted orf-text-secondary">
            <tr>
              <th className="px-3 py-2 font-semibold">指标</th>
              <th className="px-3 py-2 font-semibold">主张</th>
              <th className="px-3 py-2 font-semibold">证据</th>
            </tr>
          </thead>
          <tbody>
            {loot.resultClaims.map((claim) => (
              <tr key={claim.resultId}>
                <td className="px-3 py-2 font-medium orf-text-primary">
                  {resultById.get(claim.resultId)?.title ?? claim.resultId}
                </td>
                <td className="px-3 py-2 orf-text-secondary">
                  {lootClaimLabel(claim.claim)}
                </td>
                <td className="px-3 py-2 orf-text-secondary">
                  {claim.evidenceText ? (
                    <LinkifiedText text={claim.evidenceText} />
                  ) : (
                    <span className="orf-text-muted">-</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LinkifiedText({ text }: { text: string }) {
  return <>{linkifiedText(text)}</>;
}

function linkifiedText(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const urlPattern = /https?:\/\/[^\s<>"']+/g;
  let cursor = 0;
  for (const match of text.matchAll(urlPattern)) {
    const url = match[0];
    const index = match.index ?? 0;
    if (index > cursor) parts.push(text.slice(cursor, index));
    parts.push(
      <a
        className="orf-loot-link"
        href={url}
        key={`${url}-${index}`}
        rel="noreferrer"
        target="_blank"
      >
        {url}
      </a>,
    );
    cursor = index + url.length;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
}

function ResultReviewTable({
  readOnly,
  results,
  values,
  onChange,
}: {
  readOnly: boolean;
  results: Result[];
  values: Record<string, ResultAcceptedResult>;
  onChange: (resultId: string, value: ResultAcceptedResult) => void;
}) {
  if (results.length === 0) {
    return (
      <div className="rounded-md border orf-border p-3 text-xs orf-text-secondary">
        这个目标没有可验收的指标。
      </div>
    );
  }

  return (
    <div className="orf-loot-table-wrap">
      <table className="orf-loot-table orf-loot-result-review-table">
        <thead className="orf-surface-muted orf-text-secondary">
          <tr>
            <th className="px-3 py-2 font-semibold">指标</th>
            <th className="px-3 py-2 font-semibold">结论</th>
          </tr>
        </thead>
        <tbody>
          {results.map((result) => {
            const currentValue = readOnly
              ? "failed"
              : values[result.id] ?? "completed";
            const detail = resultDetailText(result);
            return (
              <tr key={result.id}>
                <td className="px-3 py-2">
                  <div className="orf-loot-result-title">{result.title}</div>
                  {detail && (
                    <div className="orf-loot-result-detail">{detail}</div>
                  )}
                </td>
                <td className="px-3 py-2">
                  {readOnly ? (
                    <span className={resultReviewBadgeClass(currentValue)}>
                      {resultReviewLabel(currentValue)}
                    </span>
                  ) : (
                    <FantasySelectMenu
                      ariaLabel={`${result.title} 验收结论`}
                      className="orf-loot-select orf-loot-table-select"
                      onChange={(value) => onChange(result.id, value)}
                      options={resultReviewOptions}
                      value={currentValue}
                      variant="filter"
                    />
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function LocalSettlementSummaryView({
  error,
  loading,
  summary,
  targets,
}: {
  error: string;
  loading: boolean;
  summary: LocalSettlementSummary | null;
  targets: ContributionAllocationTarget[];
}) {
  return (
    <div className="orf-loot-panel orf-loot-peer-review">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-semibold orf-text-primary">匿名互评明细</div>
        {summary && (
          <span className="orf-status-tag border orf-border px-2 py-0.5 text-xs font-semibold orf-text-secondary">
            {summaryStatusLabel(summary.status)}
          </span>
        )}
      </div>
      <div className="text-xs orf-text-secondary">
        结算时通过 ORF 代理读取共享结算服务中的最新提交状态和原始评分，最终比例由指挥官在下方确认。
      </div>
      {loading && (
        <div className="text-xs orf-text-secondary">正在读取匿名互评数据。</div>
      )}
      {error && (
        <div className="text-xs orf-warning-text">
          匿名互评数据读取失败：{error}。仍可由指挥官填写最终结算比例后结算。
        </div>
      )}
      {summary ? (
        <>
          <div className="text-xs orf-text-secondary">
            已评分 {summary.reviewers.length} 人，已弃权 {summary.abstainedReviewers.length} 人，未提交 {summary.missingReviewers.length} 人。
          </div>
          <PeerReviewRawScoreTable summary={summary} targets={targets} />
        </>
      ) : (
        !loading && (
          <div className="rounded-md border orf-border p-3 text-xs orf-text-secondary">
            暂未读取到匿名互评汇总，最终比例会先按平均分配填入。
          </div>
        )
      )}
    </div>
  );
}

function PeerReviewRawScoreTable({
  summary,
  targets,
}: {
  summary: LocalSettlementSummary;
  targets: ContributionAllocationTarget[];
}) {
  const submissionByReviewer = submissionMap(summary);
  const rawAverageByMember = rawScoreAverageByMember(summary);
  return (
    <div className="grid gap-2">
      <div className="text-xs font-semibold orf-text-primary">提交与原始评分</div>
      <div className="orf-loot-table-wrap">
        <table className="orf-loot-table">
          <thead className="orf-surface-muted orf-text-secondary">
            <tr>
              <th className="px-3 py-2 font-semibold">提交人</th>
              <th className="px-3 py-2 font-semibold">状态</th>
              <th className="px-3 py-2 font-semibold">提交时间</th>
              <th className="px-3 py-2 font-semibold">说明</th>
              {targets.map((target) => (
                <th
                  key={contributionTargetKey(target)}
                  className="px-3 py-2 font-semibold"
                >
                  {target.member}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {targets.map((target) => {
              const submission = submissionByReviewer.get(target.member);
              if (!submission) {
                return (
                  <tr key={contributionTargetKey(target)} className="border-t orf-border">
                    <td className="px-3 py-2 font-medium orf-text-primary">
                      {target.member}
                    </td>
                    <td className="px-3 py-2 orf-text-secondary">未提交</td>
                    <td className="px-3 py-2 orf-text-secondary">-</td>
                    <td className="px-3 py-2 orf-text-secondary">-</td>
                    {targets.map((allocationTarget) => (
                      <td
                        key={contributionTargetKey(allocationTarget)}
                        className="px-3 py-2 orf-text-secondary"
                      >
                        -
                      </td>
                    ))}
                  </tr>
                );
              }
              if (submission.status === "abstained") {
                return (
                  <tr key={contributionTargetKey(target)} className="border-t orf-border">
                    <td className="px-3 py-2 font-medium orf-text-primary">
                      {target.member}
                    </td>
                    <td className="px-3 py-2 orf-text-secondary">已弃权</td>
                    <td className="px-3 py-2 orf-text-secondary">
                      {formatSummaryTime(submission.submittedAt)}
                    </td>
                    <td className="px-3 py-2 orf-text-secondary">
                      {submission.abstentionReason}
                    </td>
                    {targets.map((allocationTarget) => (
                      <td
                        key={contributionTargetKey(allocationTarget)}
                        className="px-3 py-2 orf-text-secondary"
                      >
                        -
                      </td>
                    ))}
                  </tr>
                );
              }
              const allocationByMember = new Map(
                submission.allocations.map((allocation) => [
                  allocation.member,
                  allocation,
                ]),
              );
              return (
                <tr key={contributionTargetKey(target)} className="border-t orf-border">
                  <td className="px-3 py-2 font-medium orf-text-primary">
                    {target.member}
                  </td>
                  <td className="px-3 py-2 orf-text-secondary">已评分</td>
                  <td className="px-3 py-2 orf-text-secondary">
                    {formatSummaryTime(submission.submittedAt)}
                  </td>
                  <td className="px-3 py-2 orf-text-secondary">
                    {submissionNote(submission)}
                  </td>
                  {targets.map((allocationTarget) => {
                    const allocation = allocationByMember.get(allocationTarget.member);
                    const rawAverage = rawAverageByMember.get(allocationTarget.member) ?? null;
                    const rawDeviation = allocation && rawAverage !== null
                      ? allocation.ratio - rawAverage
                      : null;
                    const rawDeviationWarning = rawDeviation !== null &&
                      Math.abs(rawDeviation) >
                        CONTRIBUTION_RATIO_WARNING_THRESHOLD;
                    return (
                      <td
                        key={contributionTargetKey(allocationTarget)}
                        className="px-3 py-2 orf-text-secondary"
                      >
                        {allocation ? (
                          <div className="grid gap-1">
                            <span className="font-medium orf-text-primary">
                              {formatRatioPercent(allocation.ratio)}
                            </span>
                            {rawDeviation !== null && (
                              <span
                                className={
                                  rawDeviationWarning
                                    ? "orf-warning-text"
                                    : "orf-text-secondary"
                                }
                              >
                                较均值 {formatSignedRatioPercent(rawDeviation)}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="orf-warning-text">未覆盖</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SettlementResolutionTable({
  defaultInputs,
  targets,
  values,
  onChange,
}: {
  defaultInputs: Record<string, string>;
  targets: ContributionAllocationTarget[];
  values: Record<string, string>;
  onChange: (member: string, value: string) => void;
}) {
  return (
    <div className="orf-loot-table-wrap">
      <table className="orf-loot-table orf-loot-settlement-table">
        <thead className="orf-surface-muted orf-text-secondary">
          <tr>
            <th className="px-3 py-2 font-semibold">成员</th>
            <th className="px-3 py-2 font-semibold">默认比例</th>
            <th className="px-3 py-2 font-semibold">最终比例</th>
          </tr>
        </thead>
        <tbody>
          {targets.map(({ member }) => {
            const value = values[member] ?? defaultInputs[member] ?? "0";
            return (
              <tr key={member}>
                <td className="px-3 py-2 font-medium orf-text-primary">
                  {member}
                </td>
                <td className="px-3 py-2 orf-text-secondary">
                  {formatPercentInputText(defaultInputs[member] ?? "0")}
                </td>
                <td className="px-3 py-2 orf-text-secondary">
                  <input
                    className="orf-input orf-loot-percent-input"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    inputMode="decimal"
                    value={value}
                    onChange={(event) => onChange(member, event.target.value)}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
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
  const valid = isContributionPercentTotalValid(total);
  return (
    <div
      className={
        valid ? "text-xs orf-text-secondary" : "text-xs orf-warning-text"
      }
    >
      当前合计：{formatInputPercent(total)}%
    </div>
  );
}

function isContributionPercentTotalValid(total: number) {
  return (
    Math.abs(total - CONTRIBUTION_PERCENT_TOTAL) <=
    CONTRIBUTION_PERCENT_TOLERANCE
  );
}

function percentInputDefaults(
  members: string[],
  current: Record<string, string>,
) {
  const next: Record<string, string> = {};
  const defaults = balancedPercentDefaults(members);
  for (const member of members) {
    next[member] = current[member] ?? defaults[member] ?? "0";
  }
  return next;
}

function percentInputDefaultsFromRatios(
  targets: ContributionAllocationTarget[],
  ratios: ContributionAllocation[],
  current: Record<string, string>,
) {
  const members = targets.map((target) => target.member);
  const defaults = balancedPercentDefaults(members);
  const ratioByMember = new Map(ratios.map((ratio) => [ratio.member, ratio.ratio]));
  const next: Record<string, string> = {};
  for (const member of members) {
    const ratio = ratioByMember.get(member);
    next[member] = typeof ratio === "number"
      ? formatInputPercent(ratio * CONTRIBUTION_PERCENT_TOTAL)
      : current[member] ?? defaults[member] ?? "0";
  }
  return next;
}

function balancedPercentDefaults(members: string[]) {
  if (members.length === 0) return {};
  const next: Record<string, string> = {};
  const base = Number((CONTRIBUTION_PERCENT_TOTAL / members.length).toFixed(2));
  let assigned = 0;
  members.forEach((member, index) => {
    const value =
      index === members.length - 1
        ? CONTRIBUTION_PERCENT_TOTAL - assigned
        : base;
    assigned += value;
    next[member] = formatInputPercent(value);
  });
  return next;
}

type ContributionAllocationTarget = ContributionMemberTarget;

function contributionTargetKey(target: ContributionAllocationTarget) {
  return target.memberUserId ?? target.member;
}

function equalContributionAllocations(targets: ContributionAllocationTarget[]) {
  if (targets.length === 0) return [];
  const ratio = 1 / targets.length;
  return targets.map((target) => ({
    member: target.member,
    memberUserId: target.memberUserId ?? null,
    ratio,
  }));
}

function contributionResolutionForSettlement(input: {
  reason: string;
  resolutionResult: ReturnType<typeof percentInputsToAllocations> | null;
  settlementTargets: ContributionAllocationTarget[];
}) {
  if (input.resolutionResult?.status === "ok") {
    return {
      ratios: input.resolutionResult.allocations,
      reason: input.reason,
    };
  }

  if (input.settlementTargets.length === 1) {
    return {
      ratios: equalContributionAllocations(input.settlementTargets),
      reason: "单人正式参与",
    };
  }

  return undefined;
}

function defaultContributionResolutionReason(summary: LocalSettlementSummary | null) {
  if (!summary) return "指挥官确认最终结算比例";
  return `指挥官确认最终结算比例（已评分 ${summary.reviewers.length}，已弃权 ${summary.abstainedReviewers.length}，未提交 ${summary.missingReviewers.length}）`;
}

type LocalSettlementSubmission = LocalSettlementSummary["submissions"][number];

function submissionMap(summary: LocalSettlementSummary) {
  return new Map(summary.submissions.map((submission) => [submission.reviewer, submission]));
}

function rawScoreAverageByMember(summary: LocalSettlementSummary) {
  const valuesByMember = new Map<string, number[]>();
  for (const submission of summary.submissions) {
    if (submission.status !== "scored") continue;
    for (const allocation of submission.allocations) {
      const values = valuesByMember.get(allocation.member) ?? [];
      values.push(allocation.ratio);
      valuesByMember.set(allocation.member, values);
    }
  }

  return new Map(
    [...valuesByMember.entries()].map(([member, values]) => [
      member,
      values.reduce((sum, value) => sum + value, 0) / values.length,
    ]),
  );
}

function summaryStatusLabel(status: LocalSettlementSummary["status"]) {
  if (status === "ready") return "可参考";
  if (status === "missing") return "有未提交";
  return "需留意";
}

function submissionNote(submission: LocalSettlementSubmission | undefined) {
  if (!submission) return "-";
  if (submission.status === "abstained") return submission.abstentionReason;
  return `已提交 ${submission.allocations.length} 项评分`;
}

function formatSummaryTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function percentInputsToAllocations(
  values: Record<string, string>,
  members: ContributionAllocationTarget[],
) {
  const allocations: ContributionAllocation[] = [];
  for (const target of members) {
    const member = target.member;
    const rawValue = values[member]?.trim();
    if (!rawValue) {
      return {
        status: "invalid" as const,
        error: "请填写每个挑战者的贡献百分比",
      };
    }
    const percent = Number(rawValue);
    if (
      !Number.isFinite(percent) ||
      percent < 0 ||
      percent > CONTRIBUTION_PERCENT_TOTAL
    ) {
      return {
        status: "invalid" as const,
        error: "贡献百分比必须在 0 到 100 之间",
      };
    }
    allocations.push({
      member,
      memberUserId: target.memberUserId ?? null,
      ratio: percent / CONTRIBUTION_PERCENT_TOTAL,
    });
  }

  const total =
    allocations.reduce((sum, item) => sum + item.ratio, 0) *
    CONTRIBUTION_PERCENT_TOTAL;
  if (
    Math.abs(total - CONTRIBUTION_PERCENT_TOTAL) >
    CONTRIBUTION_PERCENT_TOLERANCE
  ) {
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

function objectiveReviewResultLabel(
  value: ReturnType<typeof objectiveAcceptedResultFromReviews>,
) {
  if (value === "completed") return "全部指标完成，目标完成。";
  if (value === "falsified") return "指标全部有效证伪，目标按有效证伪结算。";
  return "存在未完成、失败或未验收指标，目标不按完成结算。";
}

function resultReviewLabel(value: ResultAcceptedResult) {
  return (
    resultReviewOptions.find((option) => option.value === value)?.label ??
    value
  );
}

function resultReviewBadgeClass(value: ResultAcceptedResult) {
  if (value === "completed") {
    return "orf-loot-result-badge orf-loot-result-badge-success";
  }
  if (value === "falsified") {
    return "orf-loot-result-badge orf-loot-result-badge-info";
  }
  return "orf-loot-result-badge orf-loot-result-badge-warning";
}

function lootClaimLabel(value: LootResultClaimStatus) {
  return (
    lootClaimOptions.find((option) => option.value === value)?.label ?? value
  );
}

function formatInputPercent(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function formatPercentInputText(value: string) {
  const percent = Number(value);
  return Number.isFinite(percent)
    ? `${formatInputPercent(percent)}%`
    : `${value}%`;
}

function formatRatioPercent(value: number) {
  return `${formatInputPercent(value * CONTRIBUTION_PERCENT_TOTAL)}%`;
}

function formatSignedRatioPercent(value: number) {
  const percent = value * CONTRIBUTION_PERCENT_TOTAL;
  const prefix = percent > 0 ? "+" : "";
  return `${prefix}${formatInputPercent(percent)}%`;
}
