import { ArrowLeft, ClipboardCheck, Send } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { FantasySelectMenu, type FantasySelectOption } from "../components/FantasySelectMenu";
import { PageScaffold } from "../components/PageScaffold";
import { Button, Card, Field, actionButtonClassName } from "../components/ui";
import {
  buildContributionReviewMatrix,
  contributionReviewMatrixInputsFromAllocations,
  contributionReviewMatrixInputsFromDraftAllocations,
  contributionReviewMatrixToDraftAllocations,
  contributionReviewMatrixToPercentAllocations,
  contributionReviewTargetKey,
  formatContributionReviewPercent,
  normalizeContributionReviewMatrixInputs,
  type ContributionReviewMatrixInputs,
  type ContributionReviewMatrixSummary,
} from "../features/challenge/model/contributionReviewMatrix";
import {
  fetchLocalSettlementSummary,
  fetchMyLocalSettlementReview,
  saveLocalSettlementReviewDraft,
  type LocalSettlementReview,
  type LocalSettlementDraft,
  type LocalSettlementSummary,
} from "../services/localSettlementClient";
import { canViewObjectiveRecord } from "../features/challenge/model/objectiveVisibility";
import { useOrf } from "../state/OrfProvider";
import {
  canReviewObjectiveLootByFlow,
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
import {
  acceptedResultForClaim,
  objectiveAcceptedResultFromReviews,
  objectiveSettlementReviewWindow,
} from "../domain/orfSettlement";
import type {
  ContributionAllocation,
  ContributionReviewMetricScore,
  LootResultClaim,
  LootResultClaimStatus,
  ObjectiveAcceptanceReview,
  ObjectiveLoot,
  ObjectiveSettlementEvent,
  ObjectiveTrialReviewStatus,
  Result,
  ResultAcceptedResult,
} from "../types/orf";
import { localDateString } from "../utils/date";
import { canSubmitObjectivePeerReview } from "../features/challenge/model/orfFlowCapabilities";

const lootClaimOptions: Array<FantasySelectOption<LootResultClaimStatus>> = [
  { label: "完成", value: "completed" },
  { label: "证伪", value: "falsified" },
  { label: "未完成", value: "notClaimed" },
];

const resultReviewOptions: Array<FantasySelectOption<ResultAcceptedResult>> = [
  { label: "完成", value: "completed" },
  { label: "证伪", value: "falsified" },
  { label: "失败", value: "failed" },
  { label: "不验收", value: "unreviewed" },
];

const trialDecisionOptions: Array<FantasySelectOption<Exclude<ObjectiveTrialReviewStatus, "requested">>> = [
  { label: "可正式提交", value: "approved" },
  { label: "需补充", value: "needsWork" },
];

const CONTRIBUTION_PERCENT_TOTAL = 100;
const CONTRIBUTION_PERCENT_TOLERANCE = 0.01;
const CONTRIBUTION_RATIO_WARNING_THRESHOLD = 0.1;

type ContributionReviewMode = "score" | "abstain";
type ContributionReviewFormSource = "empty" | "serverDraft" | "submittedReview" | "editing";

type ContributionReviewFormSnapshot = {
  abstentionReason: string;
  matrixInputs: ContributionReviewMatrixInputs;
  peerReviewMode: ContributionReviewMode;
  updatedAt: string;
};

function ResultDetailsSummary({ result }: { result: Result }) {
  const detail = resultDetailText(result);
  if (!detail) return null;

  return (
    <div className="rounded-md border orf-border orf-surface-muted p-3 text-xs whitespace-pre-wrap leading-5 orf-text-secondary">
      {detail}
    </div>
  );
}

function InactiveLootActionPanel({
  currentSettlementEvent,
  latestAcceptanceReview,
  latestLoot,
  message,
  results,
}: {
  currentSettlementEvent: ObjectiveSettlementEvent | null;
  latestAcceptanceReview: ObjectiveAcceptanceReview | null;
  latestLoot: ObjectiveLoot | undefined;
  message: string;
  results: Result[];
}) {
  const failedReviews = latestAcceptanceReview?.resultReviews.filter(
    (review) => review.acceptedResult !== "completed" && review.acceptedResult !== "falsified",
  ) ?? [];

  return (
    <Card className="orf-card-padding">
      <div className="grid gap-4 text-sm">
        <div className="grid gap-1">
          <div className="font-semibold orf-text-primary">当前处理状态</div>
          <div className="orf-text-secondary">{message}</div>
        </div>

        {latestLoot && (
          <div className="rounded-md border orf-border p-3">
            <div className="text-xs font-semibold orf-text-muted">最近正式提交</div>
            <div className="mt-1 orf-text-primary">{latestLoot.submittedBy} · {formatSummaryTime(latestLoot.submittedAt)}</div>
            <div className="mt-2 whitespace-pre-wrap orf-text-secondary">{latestLoot.body}</div>
          </div>
        )}

        {latestAcceptanceReview && (
          <div className="rounded-md border orf-border p-3">
            <div className="text-xs font-semibold orf-text-muted">最近验收结果</div>
            <div className="mt-1 orf-text-primary">
              {objectiveAcceptanceReviewLabel(latestAcceptanceReview.acceptedResult)} · {formatSummaryTime(latestAcceptanceReview.reviewedAt)}
            </div>
            {latestAcceptanceReview.reason && (
              <div className="mt-2 whitespace-pre-wrap orf-text-secondary">{latestAcceptanceReview.reason}</div>
            )}
            {failedReviews.length > 0 && (
              <div className="mt-3 grid gap-2">
                {failedReviews.map((review) => (
                  <div key={review.resultId} className="flex flex-wrap items-center gap-2 text-xs">
                    <span className={resultReviewBadgeClass(review.acceptedResult)}>
                      {resultReviewLabel(review.acceptedResult)}
                    </span>
                    <span className="orf-text-secondary">
                      {results.find((result) => result.id === review.resultId)?.title ?? review.resultId}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {currentSettlementEvent && (
          <div className="rounded-md border orf-border p-3">
            <div className="text-xs font-semibold orf-text-muted">已完成结算事件</div>
            <div className="mt-1 orf-text-primary">
              {settlementEventLabel(currentSettlementEvent.kind)} · {formatSummaryTime(currentSettlementEvent.createdAt)}
            </div>
            <div className="mt-2 orf-text-secondary">
              本次写入 {currentSettlementEvent.settlementPoints} 分；目标累计已结算分会进入统计页。
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

function contributionReviewDraftFromLatestSubmission(input: {
  objectiveTitle: string;
  results: Result[];
  review: LocalSettlementReview;
  targets: ContributionAllocationTarget[];
}): ContributionReviewFormSnapshot | null {
  if (input.review.status === "abstained") {
    return {
      abstentionReason: input.review.abstentionReason,
      matrixInputs: normalizeContributionReviewMatrixInputs({
        current: {},
        objectiveTitle: input.objectiveTitle,
        results: input.results,
        targets: input.targets,
      }),
      peerReviewMode: "abstain",
      updatedAt: input.review.submittedAt,
    };
  }

  return {
    abstentionReason: "",
    matrixInputs: normalizeContributionReviewMatrixInputs({
      current: contributionReviewMatrixInputsFromAllocations(input.review.allocations, input.targets),
      objectiveTitle: input.objectiveTitle,
      results: input.results,
      targets: input.targets,
    }),
    peerReviewMode: "score",
    updatedAt: input.review.submittedAt,
  };
}

function contributionReviewDraftFromServerDraft(input: {
  draft: LocalSettlementDraft;
  objectiveTitle: string;
  results: Result[];
  targets: ContributionAllocationTarget[];
}): ContributionReviewFormSnapshot {
  if (input.draft.status === "abstained") {
    return {
      abstentionReason: input.draft.abstentionReason,
      matrixInputs: normalizeContributionReviewMatrixInputs({
        current: {},
        objectiveTitle: input.objectiveTitle,
        results: input.results,
        targets: input.targets,
      }),
      peerReviewMode: "abstain",
      updatedAt: input.draft.updatedAt,
    };
  }

  return {
    abstentionReason: "",
    matrixInputs: normalizeContributionReviewMatrixInputs({
      current: contributionReviewMatrixInputsFromDraftAllocations(input.draft.allocations ?? [], input.targets),
      objectiveTitle: input.objectiveTitle,
      results: input.results,
      targets: input.targets,
    }),
    peerReviewMode: "score",
    updatedAt: input.draft.updatedAt,
  };
}

function emptyContributionReviewDraft(input: {
  objectiveTitle: string;
  results: Result[];
  targets: ContributionAllocationTarget[];
  updatedAt: string;
}): ContributionReviewFormSnapshot {
  return {
    abstentionReason: "",
    matrixInputs: normalizeContributionReviewMatrixInputs({
      current: {},
      objectiveTitle: input.objectiveTitle,
      results: input.results,
      targets: input.targets,
    }),
    peerReviewMode: "score",
    updatedAt: input.updatedAt,
  };
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
  const latestAcceptanceReview = useMemo(
    () =>
      state.objectiveAcceptanceReviews
        .filter((item) => item.objectiveId === objectiveId)
        .sort((left, right) => right.reviewedAt.localeCompare(left.reviewedAt))[0] ?? null,
    [objectiveId, state.objectiveAcceptanceReviews],
  );
  const challengerAllocationTargets = useMemo(
    () => (objective ? objectiveChallengerTargets(objective) : []),
    [objective],
  );
  const currentMemberId = currentUser?.id ?? "";
  const currentMemberName = currentUser?.name ?? "";
  const todayDate = localDateString(new Date());
  const objectiveSettlementEvents = useMemo(
    () =>
      objective
        ? state.objectiveSettlementEvents.filter(
            (event) => event.objectiveId === objective.id,
          )
        : [],
    [objective, state.objectiveSettlementEvents],
  );
  const settlementReviewWindow = useMemo(
    () =>
      objectiveSettlementReviewWindow({
        objective,
        settlementEvents: objectiveSettlementEvents,
        today: todayDate,
      }),
    [objective, objectiveSettlementEvents, todayDate],
  );
  const settlementEventKind = settlementReviewWindow.kind;
  const settlementWindowOpen = settlementReviewWindow.open;
  const hasCurrentSettlementEvent = settlementReviewWindow.reason === "alreadySettled";
  const currentSettlementEvent = useMemo(
    () =>
      settlementEventKind
        ? objectiveSettlementEvents.find((event) => event.kind === settlementEventKind) ?? null
        : null,
    [objectiveSettlementEvents, settlementEventKind],
  );
  const isChallenger = Boolean(
    objective &&
      currentUser?.role === "member" &&
      isObjectiveChallenger(objective, currentMemberId),
  );
  const canPeerReview = Boolean(
    canSubmitObjectivePeerReview({
      objective,
      currentUser,
      settlementEvents: objectiveSettlementEvents,
      today: todayDate,
    }),
  );
  const [body, setBody] = useState("");
  const [selfTestReportBody, setSelfTestReportBody] = useState("");
  const [claims, setClaims] = useState<
    Record<string, { claim: LootResultClaimStatus; evidenceText: string }>
  >({});
  const [resultReviews, setResultReviews] = useState<
    Record<string, ResultAcceptedResult>
  >({});
  const [contributionMatrixInputs, setContributionMatrixInputs] =
    useState<ContributionReviewMatrixInputs>({});
  const [peerReviewMode, setPeerReviewMode] =
    useState<ContributionReviewMode>("score");
  const [abstentionReason, setAbstentionReason] = useState("");
  const [contributionReviewFormSource, setContributionReviewFormSource] =
    useState<ContributionReviewFormSource>("empty");
  const [latestContributionDraft, setLatestContributionDraft] =
    useState<LocalSettlementDraft | null>(null);
  const [latestContributionReview, setLatestContributionReview] =
    useState<LocalSettlementReview | null>(null);
  const [latestContributionReviewError, setLatestContributionReviewError] =
    useState("");
  const [latestContributionReviewLoading, setLatestContributionReviewLoading] =
    useState(false);
  const [contributionDraftSaveError, setContributionDraftSaveError] =
    useState("");
  const [resolutionInputs, setResolutionInputs] = useState<
    Record<string, string>
  >({});
  const [resolutionEdited, setResolutionEdited] = useState(false);
  const [resolutionReason, setResolutionReason] = useState("");
  const [settlementSummary, setSettlementSummary] = useState<LocalSettlementSummary | null>(null);
  const [settlementSummaryError, setSettlementSummaryError] = useState("");
  const [settlementSummaryLoading, setSettlementSummaryLoading] = useState(false);
  const [reason, setReason] = useState("");
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
  }, [results]);

  useEffect(() => {
    setResultReviews((current) => {
      if (!latestLoot) return current;
      const claimByResultId = new Map(
        latestLoot.resultClaims.map((claim) => [claim.resultId, claim.claim]),
      );
      const next: typeof current = {};
      for (const result of results) {
        next[result.id] =
          current[result.id] ??
          acceptedResultForClaim(claimByResultId.get(result.id));
      }
      return next;
    });
  }, [latestLoot, results]);

  const settlementContributionTargets = challengerAllocationTargets;
  const contributionReviewMatrix = useMemo(
    () =>
      buildContributionReviewMatrix({
        inputs: contributionMatrixInputs,
        objectiveTitle: objective?.title ?? "目标整体",
        results,
        targets: challengerAllocationTargets,
      }),
    [
      challengerAllocationTargets,
      contributionMatrixInputs,
      objective?.title,
      results,
    ],
  );
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
    settlementWindowOpen &&
    latestLoot &&
    usesLocalContributionSettlement,
  );
  const canLoadMyContributionReview = Boolean(
    canPeerReview &&
      objective &&
      usesLocalContributionSettlement,
  );
  const hasSubmittedContributionReview = latestContributionReview !== null;
  const contributionReviewLoadingLatest = canLoadMyContributionReview && latestContributionReviewLoading;
  const contributionReviewLatestLoadBlocked = canLoadMyContributionReview && Boolean(latestContributionReviewError);
  const canEditContributionReviewForm =
    !contributionReviewLoadingLatest && !contributionReviewLatestLoadBlocked;
  const contributionReviewSubmitLabel =
    peerReviewMode === "abstain"
      ? hasSubmittedContributionReview
        ? "更新弃权说明"
        : "提交弃权说明"
      : hasSubmittedContributionReview
        ? "更新匿名互评"
        : "提交匿名互评";
  const reviewedResultValues = useMemo(
    () => {
      const claimByResultId = new Map(
        (latestLoot?.resultClaims ?? []).map((claim) => [
          claim.resultId,
          claim.claim,
        ]),
      );
      return results.map(
        (result) =>
          resultReviews[result.id] ??
          acceptedResultForClaim(claimByResultId.get(result.id)),
      );
    },
    [latestLoot?.resultClaims, resultReviews, results],
  );
  const objectiveReviewResult =
    objectiveAcceptedResultFromReviews(reviewedResultValues);
  const objectiveReviewPresentation =
    objectiveReviewResultPresentation(objectiveReviewResult);

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
    if (!canLoadMyContributionReview || !objective) {
      setLatestContributionDraft(null);
      setLatestContributionReview(null);
      setLatestContributionReviewError("");
      setContributionDraftSaveError("");
      setLatestContributionReviewLoading(false);
      setContributionMatrixInputs(
        objective
          ? normalizeContributionReviewMatrixInputs({
              current: {},
              objectiveTitle: objective.title,
              results,
              targets: challengerAllocationTargets,
            })
          : {},
      );
      setPeerReviewMode("score");
      setAbstentionReason("");
      setContributionReviewFormSource("empty");
      return;
    }

    let cancelled = false;
    setLatestContributionDraft(null);
    setLatestContributionReview(null);
    setLatestContributionReviewError("");
    setContributionDraftSaveError("");
    setLatestContributionReviewLoading(true);
    void fetchMyLocalSettlementReview({ objectiveId: objective.id })
      .then((result) => {
        if (cancelled) return;
        const draft = result.draft
          ? contributionReviewDraftFromServerDraft({
              draft: result.draft,
              objectiveTitle: objective.title,
              results,
              targets: challengerAllocationTargets,
            })
          : result.review
            ? contributionReviewDraftFromLatestSubmission({
                objectiveTitle: objective.title,
                results,
                review: result.review,
                targets: challengerAllocationTargets,
              }) ?? emptyContributionReviewDraft({
                objectiveTitle: objective.title,
                results,
                targets: challengerAllocationTargets,
                updatedAt: result.review.submittedAt,
              })
            : emptyContributionReviewDraft({
                objectiveTitle: objective.title,
                results,
                targets: challengerAllocationTargets,
                updatedAt: new Date().toISOString(),
              });

        setLatestContributionDraft(result.draft);
        setLatestContributionReview(result.review);
        setContributionMatrixInputs(draft.matrixInputs);
        setPeerReviewMode(draft.peerReviewMode);
        setAbstentionReason(draft.abstentionReason);
        setContributionReviewFormSource(result.draft ? "serverDraft" : result.review ? "submittedReview" : "empty");
        setContributionDraftSaveError("");
      })
      .catch((reviewError) => {
        if (cancelled) return;
        setLatestContributionDraft(null);
        setLatestContributionReview(null);
        setLatestContributionReviewError(
          reviewError instanceof Error
            ? reviewError.message
            : "服务器最新匿名互评读取失败",
        );
      })
      .finally(() => {
        if (!cancelled) setLatestContributionReviewLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    challengerAllocationTargets,
    canLoadMyContributionReview,
    objective?.id,
    objective?.title,
    results,
  ]);

  useEffect(() => {
    if (
      !canLoadMyContributionReview ||
      !objective ||
      !canEditContributionReviewForm ||
      contributionReviewFormSource !== "editing" ||
      submittingAction === "peerReview"
    ) {
      return;
    }

    let cancelled = false;
    const timeout = window.setTimeout(() => {
      const draftRequest = peerReviewMode === "abstain"
        ? saveLocalSettlementReviewDraft({
            abstentionReason,
            kind: "abstain",
            objectiveId: objective.id,
          })
        : saveLocalSettlementReviewDraft({
            kind: "score",
            allocations: contributionReviewMatrixToDraftAllocations(contributionReviewMatrix),
            objectiveId: objective.id,
          });

      void draftRequest
        .then((result) => {
          if (cancelled) return;
          setLatestContributionDraft(result.draft);
          setContributionDraftSaveError("");
        })
        .catch((draftError) => {
          if (cancelled) return;
          setContributionDraftSaveError(
            draftError instanceof Error
              ? draftError.message
              : "匿名互评草稿自动保存失败",
          );
        });
    }, 600);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [
    abstentionReason,
    canEditContributionReviewForm,
    canLoadMyContributionReview,
    contributionReviewFormSource,
    contributionReviewMatrix,
    objective?.id,
    peerReviewMode,
    submittingAction,
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

  const canSubmit = canSubmitObjectiveLootByFlow(objective) && isChallenger;
  const canReview = Boolean(
    currentUser?.role === "admin" &&
    canReviewObjectiveLootByFlow(objective) &&
    latestLoot,
  );
  const canSettle = Boolean(
    currentUser?.role === "admin" &&
    settlementWindowOpen &&
    latestLoot,
  );
  const settlementTitle = settlementEventKind === "deadlinePenalty"
    ? "逾期惩罚互评结果"
    : "匿名互评贡献结果";
  const settlementRatioTitle = settlementEventKind === "deadlinePenalty"
    ? "惩罚结算比例"
    : "最终结算比例";
  const settlementRatioDescription = settlementEventKind === "deadlinePenalty"
    ? "默认来自当前互评平均值。确认后只写入逾期未通过验收的惩罚积分，目标仍需继续返工。"
    : "默认来自当前互评平均值。缺评、弃权和偏离只作为提示，指挥官确认合计为 100% 后即可结算。";
  const settlementSubmitLabel = settlementEventKind === "deadlinePenalty"
    ? "确认惩罚结算"
    : "确认结算";
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

    setSubmittingAction("review");
    try {
      const ok = await reviewObjectiveLoot(objective.id, {
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
    if (!canEditContributionReviewForm) {
      setError("正在确认服务器最新匿名互评，读取完成后才能继续提交");
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
        if (ok) {
          navigate("/tasks");
        }
      } finally {
        setSubmittingAction(null);
      }
      return;
    }

    const result = contributionReviewMatrixToPercentAllocations(
      contributionReviewMatrix,
    );
    if (result.status === "invalid") {
      setError(result.error);
      return;
    }

    setSubmittingAction("peerReview");
    try {
      const ok = await submitContributionReview(
        objective.id,
        {
          allocations: result.allocations,
          kind: "score",
        },
      );
      if (ok) {
        navigate("/tasks");
      }
    } finally {
      setSubmittingAction(null);
    }
  };

  const updateContributionReviewMatrixInput = (
    rowId: string,
    targetKey: string,
    value: string,
  ) => {
    setContributionReviewFormSource("editing");
    setContributionMatrixInputs((current) => ({
      ...current,
      [rowId]: {
        ...(current[rowId] ?? {}),
        [targetKey]: value,
      },
    }));
    if (error) setError("");
  };
  const inactiveActionMessage = hasCurrentSettlementEvent && objective.flowStatus === "revisionRequired"
    ? "逾期惩罚结算已完成，目标仍需返工。挑战者重新正式提交后，指挥官再次验收；验收通过后才会开放最终匿名互评和最终结算。"
    : settlementReviewWindow.reason === "deadlinePending"
      ? "目标仍在返工期内；到达截止日后才会开放逾期惩罚互评和结算。"
      : "当前状态没有可提交的验收动作。";

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
          className={actionButtonClassName({ variant: "secondary" })}
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
                </div>
                <ResultReviewTable
                  lootClaims={latestLoot?.resultClaims ?? []}
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
                  {objectiveReviewPresentation.title}
                </div>
                <div className="orf-text-secondary">
                  {objectiveReviewPresentation.description}
                </div>
              </div>
              <Field label="验收说明">
                <textarea
                  className="orf-input min-h-24 px-3 py-2 text-sm"
                  placeholder={objectiveReviewPresentation.reasonPlaceholder}
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
                  {objectiveReviewPresentation.submitLabel}
                </Button>
              </div>
            </form>
          </Card>
        ) : canSettle ? (
          <Card className="orf-loot-review-card orf-loot-settlement-card orf-card-padding">
            <form
              className="orf-loot-review-form"
              onSubmit={(event) => {
                event.preventDefault();
                void settle();
              }}
            >
              <div className="orf-loot-settlement-stack">
                <div className="orf-loot-settlement-title">
                  {settlementTitle}
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
                          {settlementRatioTitle}
                        </div>
                        <div className="text-xs orf-text-secondary">
                          {settlementRatioDescription}
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
                  {settlementSubmitLabel}
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
                评价当前目标挑战者的贡献比例，草稿和提交都会通过 ORF 代理保存到匿名互评服务；再次提交会作为最新评价参与汇总。
              </div>
              <div className="grid gap-2 rounded-md border orf-border p-3 text-sm">
                <label className="flex items-start gap-2 orf-text-primary">
                  <input
                    type="radio"
                    disabled={!canEditContributionReviewForm}
                    checked={peerReviewMode === "score"}
                    onChange={() => {
                      setContributionReviewFormSource("editing");
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
                    disabled={!canEditContributionReviewForm}
                    checked={peerReviewMode === "abstain"}
                    onChange={() => {
                      setContributionReviewFormSource("editing");
                      setPeerReviewMode("abstain");
                      if (error) setError("");
                    }}
                  />
                  <span>
                    我参与很少或不了解整体贡献，提交弃权说明
                  </span>
                </label>
              </div>
              <LatestContributionReviewNotice
                draft={latestContributionDraft}
                loading={latestContributionReviewLoading}
                review={latestContributionReview}
                source={contributionReviewFormSource}
                error={latestContributionReviewError}
              />
              {contributionDraftSaveError && (
                <div className="orf-loot-peer-review-notice orf-loot-peer-review-notice-warning">
                  草稿自动保存失败：{contributionDraftSaveError}
                </div>
              )}
              {!canEditContributionReviewForm ? null : peerReviewMode === "score" ? (
                <>
                  <div className="rounded-md border orf-border orf-surface-muted p-3 text-xs orf-text-secondary">
                    按指标填写每位目标挑战者的整数贡献百分比；每一行合计必须为
                    100%。目标级汇总由匿名互评服务按服务端指标权重统一计算。
                  </div>
                  <ContributionReviewMatrixTable
                    currentMemberName={currentMemberName}
                    summary={contributionReviewMatrix}
                    onChange={updateContributionReviewMatrixInput}
                  />
                </>
              ) : (
                <Field label="弃权说明">
                  <textarea
                    className="orf-input min-h-28 px-3 py-2 text-sm"
                    placeholder="简述你大概做了什么，以及为什么无法判断其他人的贡献比例"
                    value={abstentionReason}
                    onChange={(event) => {
                      setContributionReviewFormSource("editing");
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
                  disabled={submittingAction === "peerReview" || !canEditContributionReviewForm}
                >
                  {contributionReviewSubmitLabel}
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
          <InactiveLootActionPanel
            currentSettlementEvent={currentSettlementEvent}
            latestAcceptanceReview={latestAcceptanceReview}
            latestLoot={latestLoot}
            message={inactiveActionMessage}
            results={results}
          />
        )}
      </div>
    </PageScaffold>
  );
}

function LootSubmissionReviewPanel({
  loot,
}: {
  loot: ObjectiveLoot;
}) {
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
  lootClaims,
  results,
  values,
  onChange,
}: {
  lootClaims: LootResultClaim[];
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

  const claimByResultId = new Map(
    lootClaims.map((claim) => [claim.resultId, claim]),
  );

  return (
    <div className="orf-loot-table-wrap">
      <table className="orf-loot-table orf-loot-result-review-table">
        <thead className="orf-surface-muted orf-text-secondary">
          <tr>
            <th className="px-3 py-2 font-semibold">指标</th>
            <th className="px-3 py-2 font-semibold">完成声明与证据</th>
            <th className="px-3 py-2 font-semibold">结论</th>
          </tr>
        </thead>
        <tbody>
          {results.map((result) => {
            const claim = claimByResultId.get(result.id);
            const currentValue =
              values[result.id] ?? acceptedResultForClaim(claim?.claim);
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
                  <div className="orf-loot-claim-cell">
                    <span className={lootClaimBadgeClass(claim?.claim)}>
                      {claim ? lootClaimLabel(claim.claim) : "未完成"}
                    </span>
                    {claim?.evidenceText ? (
                      <div className="orf-loot-claim-evidence">
                        <LinkifiedText text={claim.evidenceText} />
                      </div>
                    ) : (
                      <div className="orf-loot-claim-evidence orf-text-muted">
                        -
                      </div>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2">
                  <FantasySelectMenu
                    ariaLabel={`${result.title} 验收结论`}
                    className="orf-loot-select orf-loot-table-select"
                    onChange={(value) => onChange(result.id, value)}
                    options={resultReviewOptions}
                    value={currentValue}
                    variant="filter"
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
      <div className="orf-loot-peer-review-heading">
        <div className="font-semibold orf-text-primary">匿名互评明细</div>
        {summary && (
          <span className="orf-loot-peer-review-summary-status orf-status-tag">
            {summaryStatusLabel(summary.status)}
          </span>
        )}
      </div>
      <div className="orf-loot-peer-review-description">
        这里只在指挥官结算页展示共享结算服务里的最新提交状态、目标级评分和逐指标明细；挑战者页面不会读取其他人的评价。最终比例由指挥官在下方确认。
      </div>
      {loading && (
        <div className="orf-loot-peer-review-empty">正在读取匿名互评数据。</div>
      )}
      {error && (
        <div className="orf-loot-peer-review-empty orf-warning-text">
          匿名互评数据读取失败：{error}。仍可由指挥官填写最终结算比例后结算。
        </div>
      )}
      {summary ? (
        <>
          <div className="orf-loot-peer-review-stats">
            <div data-state="scored">
              <span>已评分</span>
              <strong>{summary.reviewers.length}</strong>
            </div>
            <div data-state="abstained">
              <span>已弃权</span>
              <strong>{summary.abstainedReviewers.length}</strong>
            </div>
            <div data-state="missing">
              <span>未提交</span>
              <strong>{summary.missingReviewers.length}</strong>
            </div>
          </div>
          <PeerReviewRawScoreTable summary={summary} targets={targets} />
        </>
      ) : (
        !loading && (
          <div className="orf-loot-peer-review-empty-state">
            暂未读取到匿名互评汇总，最终比例会先按平均分配填入。
          </div>
        )
      )}
    </div>
  );
}

function LatestContributionReviewNotice({
  draft,
  error,
  loading,
  review,
  source,
}: {
  draft: LocalSettlementDraft | null;
  error: string;
  loading: boolean;
  review: LocalSettlementReview | null;
  source: ContributionReviewFormSource;
}) {
  if (loading) {
    return (
      <div className="orf-loot-peer-review-notice">
        正在读取你对这个目标的服务器最新匿名互评；这里只会读取你的提交，不显示其他人的评价。
      </div>
    );
  }

  if (error) {
    return (
      <div className="orf-loot-peer-review-notice orf-loot-peer-review-notice-warning">
        服务器最新匿名互评读取失败：{error}
      </div>
    );
  }

  if (draft) {
    const updatedAt = formatSummaryTime(draft.updatedAt);
    return (
      <div className="orf-loot-peer-review-notice">
        {source === "serverDraft" ? "已回填" : "检测到"}你在 {updatedAt} 自动保存的服务器草稿；提交后这份草稿会清空。
      </div>
    );
  }

  if (!review) {
    return (
      <div className="orf-loot-peer-review-notice">
        暂未找到你对这个目标提交过的匿名互评；挑战者页面只显示自己的评价状态。
      </div>
    );
  }

  const submittedAt = formatSummaryTime(review.submittedAt);
  if (review.status === "abstained") {
    return (
      <div className="orf-loot-peer-review-notice">
        {source === "submittedReview" ? "已回填" : "检测到"}你在 {submittedAt} 提交的最新弃权说明；这里只显示你自己的最新提交。
      </div>
    );
  }

  return (
    <div className="orf-loot-peer-review-notice">
      {source === "submittedReview" ? "已回填" : "检测到"}你在 {submittedAt} 提交的服务器最新目标贡献评价；再次提交会成为新的最新评价。
      <span className="orf-loot-peer-review-notice-inline">
        最新目标比例：{formatAllocationInline(review.allocations)}
      </span>
    </div>
  );
}

function ContributionReviewMatrixTable({
  currentMemberName,
  onChange,
  summary,
}: {
  currentMemberName: string;
  onChange: (rowId: string, targetKey: string, value: string) => void;
  summary: ContributionReviewMatrixSummary;
}) {
  return (
    <div className="orf-loot-panel orf-loot-peer-review-matrix">
      <div className="orf-loot-panel-heading">
        <div>
          <div className="text-sm font-semibold orf-text-primary">
            目标贡献分配
          </div>
          <div className="text-xs orf-text-secondary">
            直接按目标整体填写每位挑战者的贡献比例；合计必须为 100%。
          </div>
        </div>
        <span
          className={
            summary.valid
              ? "orf-loot-total-pill"
              : "orf-loot-total-pill orf-loot-total-pill-warning"
          }
        >
          {summary.valid ? "可提交" : "检查合计"}
        </span>
      </div>
      <div className="orf-loot-table-wrap">
        <table className="orf-loot-table orf-loot-peer-review-table">
          <thead className="orf-surface-muted orf-text-secondary">
            <tr>
              <th className="px-3 py-2 font-semibold">目标</th>
              {summary.targetCells.map((target) => (
                <th
                  key={target.targetKey}
                  className="px-3 py-2 font-semibold"
                >
                  {target.member}
                  {target.member === currentMemberName ? "（你）" : ""}
                </th>
              ))}
              <th className="px-3 py-2 font-semibold">行合计</th>
            </tr>
          </thead>
          <tbody>
            {summary.rows.map((row) => (
              <tr key={row.id}>
                <td className="px-3 py-2">
                  <div className="orf-loot-result-title">{row.title}</div>
                  <div className="orf-loot-result-meta">
                    目标整体
                  </div>
                  {row.detail && (
                    <div className="orf-loot-result-detail">{row.detail}</div>
                  )}
                </td>
                {row.cells.map((cell) => (
                  <td key={cell.targetKey} className="px-3 py-2">
                    <input
                      aria-label={`${row.title} ${cell.member} 贡献百分比`}
                      className="orf-input orf-loot-percent-input"
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      inputMode="numeric"
                      value={cell.input}
                      onChange={(event) =>
                        onChange(row.id, cell.targetKey, event.target.value)
                      }
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <span
                    className={
                      row.valid
                        ? "orf-loot-total-pill"
                        : "orf-loot-total-pill orf-loot-total-pill-warning"
                    }
                  >
                    {formatContributionReviewPercent(row.totalPercent)}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
  const rawAverageByMember = rawScoreAverageByTarget(summary);
  return (
    <div className="orf-loot-peer-review-submissions">
      {targets.map((target) => (
        <PeerReviewSubmissionCard
          key={contributionTargetKey(target)}
          rawAverageByMember={rawAverageByMember}
          reviewer={target}
          submission={submissionByReviewer.get(contributionTargetKey(target))}
          targets={targets}
        />
      ))}
    </div>
  );
}

function PeerReviewSubmissionCard({
  rawAverageByMember,
  reviewer,
  submission,
  targets,
}: {
  rawAverageByMember: Map<string, number>;
  reviewer: ContributionAllocationTarget;
  submission: LocalSettlementSubmission | undefined;
  targets: ContributionAllocationTarget[];
}) {
  const hasWarning = submission?.status === "scored" ? submissionHasWarning(submission) : false;
  const statusState = !submission
    ? "missing"
    : submission.status === "abstained"
      ? "abstained"
      : hasWarning
        ? "warning"
        : "scored";
  const statusLabel = !submission
    ? "未提交"
    : submission.status === "abstained"
      ? "已弃权"
      : hasWarning
        ? "有偏差"
        : "已评分";
  const statusClassName = hasWarning
    ? "orf-loot-peer-review-status orf-loot-peer-review-status-warning"
    : "orf-loot-peer-review-status";
  return (
    <section className="orf-loot-peer-review-card" data-status={statusState}>
      <div className="orf-loot-peer-review-card-header">
        <div>
          <div className="orf-loot-peer-review-card-title">{reviewer.member}</div>
          <div className="orf-loot-peer-review-card-meta">
            {submission ? formatSummaryTime(submission.submittedAt) : "等待提交"}
          </div>
        </div>
        <span className={statusClassName}>{statusLabel}</span>
      </div>
      {!submission ? (
        <div className="orf-loot-peer-review-empty">这个成员还没有提交匿名互评。</div>
      ) : submission.status === "abstained" ? (
        <div className="orf-loot-peer-review-empty">{submission.abstentionReason}</div>
      ) : (
        <div className="grid gap-3">
          <div className="orf-loot-peer-review-block-title">目标级评分</div>
          <PeerReviewAllocationSummary
            rawAverageByMember={rawAverageByMember}
            submission={submission}
            targets={targets}
          />
          {submission.metricScores && submission.metricScores.length > 0 ? (
            <>
              <div className="orf-loot-peer-review-block-title">逐指标评分</div>
              <PeerReviewMetricScoreTable
                metricScores={submission.metricScores}
                targets={targets}
              />
            </>
          ) : (
            <div className="orf-loot-peer-review-empty">
              这条旧提交只保存了目标最终比例，没有逐指标明细。
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function PeerReviewAllocationSummary({
  rawAverageByMember,
  submission,
  targets,
}: {
  rawAverageByMember: Map<string, number>;
  submission: Extract<LocalSettlementSubmission, { status: "scored" }>;
  targets: ContributionAllocationTarget[];
}) {
  const allocationByMember = new Map(
    submission.allocations.map((allocation) => [contributionAllocationKey(allocation), allocation]),
  );
  return (
    <div className="orf-loot-peer-review-allocation-row">
      {targets.map((target) => {
        const targetKey = contributionTargetKey(target);
        const allocation = allocationByMember.get(targetKey);
        const rawAverage = rawAverageByMember.get(targetKey) ?? null;
        const rawDeviation = allocation && rawAverage !== null
          ? allocation.ratio - rawAverage
          : null;
        const rawDeviationWarning = rawDeviation !== null &&
          Math.abs(rawDeviation) > CONTRIBUTION_RATIO_WARNING_THRESHOLD;
        return (
          <div
            key={targetKey}
            data-warning={rawDeviationWarning ? "true" : undefined}
          >
            <span>{target.member}</span>
            <strong>{allocation ? formatRatioPercent(allocation.ratio) : "-"}</strong>
            {rawDeviation !== null && (
              <em className={rawDeviationWarning ? "orf-warning-text" : ""}>
                较均值 {formatSignedRatioPercent(rawDeviation)}
              </em>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PeerReviewMetricScoreTable({
  metricScores,
  targets,
}: {
  metricScores: ContributionReviewMetricScore[];
  targets: ContributionAllocationTarget[];
}) {
  return (
    <div className="orf-loot-table-wrap">
      <table className="orf-loot-table orf-loot-peer-review-metric-table">
        <thead className="orf-surface-muted orf-text-secondary">
          <tr>
            <th className="px-3 py-2 font-semibold">指标</th>
            {targets.map((target) => (
              <th key={contributionTargetKey(target)} className="px-3 py-2 font-semibold">
                {target.member}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {metricScores.map((metric) => {
            const allocationByMember = new Map(
              metric.allocations.map((allocation) => [contributionAllocationKey(allocation), allocation]),
            );
            return (
              <tr key={metric.metricId}>
                <td className="px-3 py-2">
                  <div className="orf-loot-result-title">{metric.metricTitle}</div>
                  <div className="orf-loot-result-meta">
                    指标分 {metric.points ?? 0} · 权重 {formatContributionReviewPercent(metric.weightRatio * 100)}%
                  </div>
                </td>
                {targets.map((target) => {
                  const targetKey = contributionTargetKey(target);
                  const allocation = allocationByMember.get(targetKey);
                  return (
                    <td key={targetKey} className="px-3 py-2">
                      {allocation ? formatRatioPercent(allocation.ratio) : "-"}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
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
    <div className="orf-loot-table-wrap orf-loot-settlement-table-wrap">
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
    <div className="orf-loot-single-summary">
      <div className="flex justify-between gap-3">
        <span className="orf-text-primary">{member}</span>
        <span className="orf-text-secondary">100%</span>
      </div>
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
  const ratioByTarget = new Map(ratios.map((ratio) => [contributionAllocationKey(ratio), ratio.ratio]));
  const next: Record<string, string> = {};
  for (const target of targets) {
    const member = target.member;
    const ratio = ratioByTarget.get(contributionTargetKey(target));
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
  return contributionReviewTargetKey(target);
}

function contributionAllocationKey(allocation: { member: string; memberUserId: string }) {
  return allocation.memberUserId.trim();
}

function contributionSubmissionKey(submission: { reviewer: string; reviewerUserId: string }) {
  return submission.reviewerUserId.trim();
}

function contributionTargetForAllocation(
  allocation: { member: string; memberUserId: string },
  targets: ContributionAllocationTarget[],
) {
  return targets.find((target) => target.memberUserId === allocation.memberUserId);
}

function equalContributionAllocations(targets: ContributionAllocationTarget[]) {
  if (targets.length === 0) return [];
  const ratio = 1 / targets.length;
  return targets.map((target) => ({
    member: target.member,
    memberUserId: target.memberUserId,
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
  return new Map(summary.submissions.map((submission) => [contributionSubmissionKey(submission), submission]));
}

function formatAllocationInline(allocations: ContributionAllocation[]) {
  return allocations.map((allocation) =>
    `${allocation.member} ${formatRatioPercent(allocation.ratio)}`
  ).join(" · ");
}

function submissionHasWarning(submission: Extract<LocalSettlementSubmission, { status: "scored" }>) {
  return submission.allocations.some((allocation) => allocation.deviationWarning);
}

function rawScoreAverageByTarget(summary: LocalSettlementSummary) {
  const valuesByMember = new Map<string, number[]>();
  for (const submission of summary.submissions) {
    if (submission.status !== "scored") continue;
    for (const allocation of submission.allocations) {
      const targetKey = contributionAllocationKey(allocation);
      const values = valuesByMember.get(targetKey) ?? [];
      values.push(allocation.ratio);
      valuesByMember.set(targetKey, values);
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
      memberUserId: target.memberUserId,
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

function objectiveReviewResultPresentation(
  value: ReturnType<typeof objectiveAcceptedResultFromReviews>,
) {
  if (value === "completed") {
    return {
      description: "全部指标完成；提交后目标进入已验收，挑战者可以继续匿名互评。",
      reasonPlaceholder: "可填写验收说明，例如完成证据确认结果。",
      submitLabel: "确认验收通过",
      title: "目标将验收通过",
    };
  }
  if (value === "falsified") {
    return {
      description: "指标全部有效证伪；提交后目标进入已验收，并按有效证伪口径结算。",
      reasonPlaceholder: "可填写有效证伪的验收说明。",
      submitLabel: "确认有效证伪",
      title: "目标将按证伪通过",
    };
  }
  return {
    description: "存在未完成、失败或未验收指标；提交后目标进入待返工，挑战者需要继续完成并重新提交。",
    reasonPlaceholder: "建议填写返工原因和需要补充的验收材料。",
    submitLabel: "确认要求返工",
    title: "目标将进入待返工",
  };
}

function objectiveAcceptanceReviewLabel(value: ObjectiveAcceptanceReview["acceptedResult"]) {
  if (value === "completed") return "验收通过";
  if (value === "falsified") return "有效证伪";
  if (value === "overdelivered") return "超额完成";
  if (value === "overturned") return "结论改判";
  return "验收不通过";
}

function settlementEventLabel(value: ObjectiveSettlementEvent["kind"]) {
  return value === "deadlinePenalty" ? "逾期惩罚结算" : "最终结算";
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

function lootClaimBadgeClass(value: LootResultClaimStatus | undefined) {
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
