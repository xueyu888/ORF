import { randomUUID } from "node:crypto";
import { and, eq, inArray, or } from "drizzle-orm";
import { initialOrfState } from "../../src/data/initialOrfState";
import type {
  BountySource,
  ChallengeApplication,
  CommentStatus,
  CommentTargetType,
  ContributionAllocation,
  CommentThread,
  Evidence,
  Feedback,
  FeedbackStatus,
  LootResultClaim,
  MetricDirection,
  Objective,
  ObjectiveAcceptedResult,
  ObjectiveLoot,
  ObjectiveContributionReview,
  OrfStage,
  OrfState,
  PointLedgerEntry,
  Priority,
  Result,
  ResultAcceptedResult,
  Task,
  TaskStatus,
  UncertaintyLevel,
} from "../../src/types/orf";
import {
  normalizeContributionAllocations,
  summarizeContributionReviews,
} from "../../src/features/challenge/model/contributionReview";
import {
  objectiveApplicationReviewFlowStatuses as applicationReviewFlowStatuses,
  objectiveChallengeApplicationFlowStatuses as bountyHallFlowStatuses,
  objectiveRecruitmentFlowStatuses as challengeRecruitmentFlowStatuses,
} from "../../src/domain/orfLifecycle";
import { db } from "../db/client";
import {
  commentMessages,
  commentThreads,
  evidence,
  feedback,
  feedbackCauseCategories,
  objectives,
  objectiveLoot,
  objectiveContributionReviews,
  pointLedger,
  results,
  resultTrendPoints,
  taskChecklistItems,
  tasks,
  teamMembers,
  teams,
  users,
} from "../db/schema";
import { getPermissionRulesForScope } from "./permissionRepository";
import type { RuntimeScope } from "./runtimeScope";
import { runtimeScope, runtimeScopeStorageId } from "./runtimeScope";
import { getScopedUsers } from "./userRepository";
import { addCalendarDays, isDateOnlyString, localDateString } from "../../src/utils/date";

export type TaskManagementData = Pick<
  OrfState,
  "objectives" | "results" | "tasks" | "evidence" | "feedback" | "comments" | "objectiveLoot" | "objectiveContributionReviews" | "pointLedger" | "permissionRules"
>;

export type TaskManagementDataScope = {
  scope?: RuntimeScope | null;
};

type CommentActor = {
  canManageAllComments?: boolean;
  id: string;
  name: string;
  role: "admin" | "member";
  scope?: RuntimeScope | null;
};

type CommentMutationOutcome =
  | { status: "ok"; thread?: CommentThread }
  | { status: "notFound" }
  | { status: "forbidden" }
  | { status: "invalid" };
type CommentThreadRow = typeof commentThreads.$inferSelect;
type CommentMessageRow = typeof commentMessages.$inferSelect;

const today = () => localDateString(new Date());
let lastNowMs = 0;
const nowIso = () => {
  const nextNowMs = Math.max(Date.now(), lastNowMs + 1);
  lastNowMs = nextNowMs;
  return new Date(nextNowMs).toISOString();
};
let idCounter = 0;
const nextIdCounter = () => {
  idCounter = (idCounter + 1) % Number.MAX_SAFE_INTEGER;
  return idCounter.toString(36);
};
const makeId = (prefix: string) => `${prefix}-${Date.now()}-${nextIdCounter()}-${randomUUID()}`;
const HALF_DAY_MS = 12 * 60 * 60 * 1000;
const MAX_CONFIRMATION_HALVES = 18;
const uncertaintyScores: Record<UncertaintyLevel, number> = {
  入门: 10,
  进阶: 30,
  破局: 90,
  渡劫: 270,
  飞升: 810,
};
const difficultyRanks: Record<UncertaintyLevel, number> = {
  入门: 1,
  进阶: 2,
  破局: 3,
  渡劫: 4,
  飞升: 5,
};
const challengeAcceptanceFlowStatuses = new Set<Objective["flowStatus"]>(["recruiting", "reestimating"]);
const resultMutationFlowStatuses = new Set<Objective["flowStatus"]>(["candidate", "open", "applying", "recruiting", "reestimating"]);
const workItemMutationFlowStatuses = new Set<Objective["flowStatus"]>(["reestimating", "frozen"]);
const commentLockedFlowStatuses = new Set<Objective["flowStatus"]>(["settled", "closed"]);
const memberCommentFlowStatuses = new Set<Objective["flowStatus"]>(["reestimating", "frozen", "submitted"]);
const objectiveDeleteLockedFlowStatuses = new Set<Objective["flowStatus"]>(["submitted", "settled"]);
const terminalFlowStatuses = new Set<Objective["flowStatus"]>(["submitted", "settled", "closed"]);

function optional<T>(value: T | null): T | undefined {
  return value ?? undefined;
}

function confirmationDueAt(finalDueAt: string | null, acceptedAt: string) {
  if (!finalDueAt) return null;

  const finalDueDate = new Date(`${finalDueAt}T23:59:00`);
  const acceptedDate = new Date(acceptedAt);
  if (Number.isNaN(finalDueDate.getTime()) || Number.isNaN(acceptedDate.getTime())) return null;

  const remainingMs = finalDueDate.getTime() - acceptedDate.getTime();
  if (remainingMs < HALF_DAY_MS) return null;

  const roundedHalfDays = Math.round((remainingMs * 0.3) / HALF_DAY_MS);
  const confirmationHalves = Math.min(MAX_CONFIRMATION_HALVES, Math.max(1, roundedHalfDays));
  return new Date(acceptedDate.getTime() + confirmationHalves * HALF_DAY_MS).toISOString();
}

function isReestimateWindowOpen(value: string | null | undefined) {
  if (!value) return true;
  const dueTime = new Date(value).getTime();
  return Number.isFinite(dueTime) && Date.now() <= dueTime;
}

function addDays(value: string, days: number) {
  return addCalendarDays(value, days, value);
}

function isMissingCommentStorageError(error: unknown) {
  const cause = error && typeof error === "object" && "cause" in error ? (error as { cause?: unknown }).cause : error;
  if (!cause || typeof cause !== "object" || !("code" in cause)) {
    return false;
  }

  return cause.code === "42P01" || cause.code === "42704";
}

function scopedStorageId(scope: TaskManagementDataScope = {}) {
  return scope.scope ? runtimeScopeStorageId(scope.scope).trim() : "";
}

function storageScope(id: string | null | undefined): RuntimeScope | null {
  const storageId = id?.trim();
  return storageId ? runtimeScope(storageId) : null;
}

async function getCommentRows(scope: TaskManagementDataScope = {}): Promise<[CommentThreadRow[], CommentMessageRow[]]> {
  try {
    const storageScopeId = scopedStorageId(scope);
    const threadRows = storageScopeId
      ? await db.select().from(commentThreads).where(eq(commentThreads.teamId, storageScopeId))
      : await db.select().from(commentThreads);
    const threadIds = threadRows.map((thread) => thread.id);
    const messageRows =
      threadIds.length > 0
        ? await db.select().from(commentMessages).where(inArray(commentMessages.threadId, threadIds))
        : [];

    return [threadRows, messageRows];
  } catch (error) {
    if (isMissingCommentStorageError(error)) {
      return [[], []];
    }

    throw error;
  }
}

function statusFromChecklist(rows: readonly { done: boolean }[], fallback: TaskStatus = "Todo"): TaskStatus {
  if (rows.length === 0) {
    return fallback === "Done" ? "Todo" : fallback;
  }

  const completedCount = rows.filter((row) => row.done).length;
  return completedCount === rows.length ? "Done" : completedCount > 0 ? "In Progress" : "Todo";
}

function reorderIds(ids: string[], movingId: string, referenceId: string, placement: "before" | "after"): string[] {
  const withoutMoving = ids.filter((id) => id !== movingId);
  const referenceIndex = withoutMoving.indexOf(referenceId);
  if (referenceIndex < 0) {
    return [...withoutMoving, movingId];
  }

  const insertIndex = placement === "before" ? referenceIndex : referenceIndex + 1;
  return [...withoutMoving.slice(0, insertIndex), movingId, ...withoutMoving.slice(insertIndex)];
}

function isRealMember(value: string | undefined | null) {
  const name = value?.trim() ?? "";
  return name !== "" && name !== "User" && name !== "未分配";
}

function uniqueMembers(values: Array<string | undefined | null>) {
  return Array.from(new Set(values.filter(isRealMember).map((value) => value!.trim())));
}

async function getActiveMemberNameSetInScope(storageScopeId: string, values: Array<string | undefined | null>) {
  const memberNames = uniqueMembers(values);
  if (memberNames.length === 0) return new Set<string>();

  const rows = await db
    .select({ name: users.name })
    .from(teamMembers)
    .innerJoin(users, eq(teamMembers.userId, users.id))
    .where(and(eq(teamMembers.teamId, storageScopeId), eq(users.status, "active"), inArray(users.name, memberNames)));
  return new Set(rows.map((member) => member.name));
}

function uncertaintyScore(level: UncertaintyLevel | null) {
  return level ? uncertaintyScores[level] : uncertaintyScores["进阶"];
}

function isObjectiveTerminal(objective: Pick<Objective, "acceptedResult" | "flowStatus" | "lootSubmittedAt" | "objectiveSettlementPoints">) {
  return terminalFlowStatuses.has(objective.flowStatus) || Boolean(objective.lootSubmittedAt || objective.acceptedResult || objective.objectiveSettlementPoints != null);
}

async function getResultTrendRows(resultIds: string[]) {
  if (resultIds.length === 0) return [];
  return db.select().from(resultTrendPoints).where(inArray(resultTrendPoints.resultId, resultIds));
}

async function getChecklistRows(taskIds: string[]) {
  if (taskIds.length === 0) return [];
  return db.select().from(taskChecklistItems).where(inArray(taskChecklistItems.taskId, taskIds));
}

async function getFeedbackCauseRows(feedbackIds: string[]) {
  if (feedbackIds.length === 0) return [];
  return db.select().from(feedbackCauseCategories).where(inArray(feedbackCauseCategories.feedbackId, feedbackIds));
}

function completionMultiplierFor(result: ObjectiveAcceptedResult, lootSubmittedAt: string | null, finalDueAt: string) {
  if (result === "abandoned") return 0;
  if (result === "overdelivered") return 1.5;
  if (result === "overturned") return 1;
  if (result !== "completed" && result !== "falsified") return 0;
  if (!lootSubmittedAt || !finalDueAt) return 0;
  return lootSubmittedAt.slice(0, 10) <= finalDueAt ? 1 : 0.5;
}

function normalizeContributionRatios(input: Array<{ member: string; ratio: number }>, challengers: string[]) {
  const challengerSet = new Set(challengers);
  const ratioByMember = new Map<string, number>();
  for (const item of input) {
    const member = item.member.trim();
    const ratio = Number(item.ratio);
    if (!challengerSet.has(member) || !Number.isFinite(ratio) || ratio < 0) continue;
    ratioByMember.set(member, (ratioByMember.get(member) ?? 0) + ratio);
  }

  const ratios = challengers
    .filter((member) => ratioByMember.has(member))
    .map((member) => ({ member, ratio: ratioByMember.get(member) ?? 0 }));
  const total = ratios.reduce((sum, item) => sum + item.ratio, 0);
  if (ratios.length === 0 || total <= 0) return null;
  return ratios.map((item) => ({ member: item.member, ratio: item.ratio / total }));
}

function objectiveAcceptedResultFromReviews(reviews: ResultAcceptedResult[]): ObjectiveAcceptedResult {
  if (reviews.length === 0) return "abandoned";
  if (reviews.every((review) => review === "completed")) return "completed";
  if (reviews.every((review) => review === "falsified")) return "falsified";
  return "abandoned";
}

export async function getTaskManagementData(scope: TaskManagementDataScope = {}): Promise<TaskManagementData> {
  const storageScopeId = scopedStorageId(scope);
  const objectiveRows = storageScopeId ? await db.select().from(objectives).where(eq(objectives.teamId, storageScopeId)) : await db.select().from(objectives);
  const resultRows = storageScopeId ? await db.select().from(results).where(eq(results.teamId, storageScopeId)) : await db.select().from(results);
  const taskRows = storageScopeId ? await db.select().from(tasks).where(eq(tasks.teamId, storageScopeId)) : await db.select().from(tasks);
  const evidenceRows = storageScopeId ? await db.select().from(evidence).where(eq(evidence.teamId, storageScopeId)) : await db.select().from(evidence);
  const feedbackRows = storageScopeId ? await db.select().from(feedback).where(eq(feedback.teamId, storageScopeId)) : await db.select().from(feedback);
  const objectiveLootRows = storageScopeId ? await db.select().from(objectiveLoot).where(eq(objectiveLoot.teamId, storageScopeId)) : await db.select().from(objectiveLoot);
  const objectiveContributionReviewRows = storageScopeId
    ? await db.select().from(objectiveContributionReviews).where(eq(objectiveContributionReviews.teamId, storageScopeId))
    : await db.select().from(objectiveContributionReviews);
  const pointLedgerRows = storageScopeId ? await db.select().from(pointLedger).where(eq(pointLedger.teamId, storageScopeId)) : await db.select().from(pointLedger);
  const scopeRows = storageScopeId ? await db.select({ id: teams.id }).from(teams).where(eq(teams.id, storageScopeId)) : await db.select({ id: teams.id }).from(teams);
  const resultIds = resultRows.map((result) => result.id);
  const taskIds = taskRows.map((task) => task.id);
  const feedbackIds = feedbackRows.map((item) => item.id);
  const trendRows = await getResultTrendRows(resultIds);
  const checklistRows = await getChecklistRows(taskIds);
  const causeRows = await getFeedbackCauseRows(feedbackIds);
  const [commentThreadRows, commentMessageRows] = await getCommentRows({ scope: storageScope(storageScopeId) });
  const permissionRules = scopeRows[0] ? await getPermissionRulesForScope(runtimeScope(scopeRows[0].id)) : initialOrfState.permissionRules;

  const checklistByTask = new Map<string, Task["checklist"]>();
  for (const item of checklistRows.sort((left, right) => left.sortOrder - right.sortOrder)) {
    const list = checklistByTask.get(item.taskId) ?? [];
    list.push({ id: item.id, label: item.label, done: item.done, updatedAt: item.updatedAt });
    checklistByTask.set(item.taskId, list);
  }

  const trendByResult = new Map<string, Result["trend"]>();
  for (const point of trendRows.sort((left, right) => left.sortOrder - right.sortOrder)) {
    const list = trendByResult.get(point.resultId) ?? [];
    list.push({ date: point.date, value: point.value });
    trendByResult.set(point.resultId, list);
  }

  const causeCategoriesByFeedback = new Map<string, string[]>();
  for (const item of causeRows.sort((left, right) => left.sortOrder - right.sortOrder)) {
    const list = causeCategoriesByFeedback.get(item.feedbackId) ?? [];
    list.push(item.category);
    causeCategoriesByFeedback.set(item.feedbackId, list);
  }

  const orderedTaskRows = [...taskRows].sort((left, right) => left.sortOrder - right.sortOrder);
  const orderedResultRows = [...resultRows].sort((left, right) => left.sortOrder - right.sortOrder);
  const messagesByThread = new Map<string, CommentThread["messages"]>();
  for (const message of [...commentMessageRows].sort(
    (left, right) => left.sortOrder - right.sortOrder || left.createdAt.localeCompare(right.createdAt),
  )) {
    const messages = messagesByThread.get(message.threadId) ?? [];
    messages.push({
      id: message.id,
      author: message.author,
      body: message.body,
      createdAt: message.createdAt,
      parentMessageId: optional(message.parentMessageId),
      replyToMessageId: optional(message.replyToMessageId),
      replyToAuthor: optional(message.replyToAuthor),
    });
    messagesByThread.set(message.threadId, messages);
  }

  const taskItems: Task[] = orderedTaskRows.map((task) => ({
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    assignee: task.assignee,
    linkedObjectiveId: task.linkedObjectiveId,
    linkedResultId: task.linkedResultId,
    feedbackOriginId: optional(task.feedbackOriginId),
    dueDate: task.dueDate,
    tags: task.tags,
    checklist: checklistByTask.get(task.id) ?? [],
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  }));

  const evidenceItems: Evidence[] = evidenceRows.map((item) => ({
    id: item.id,
    type: item.type,
    title: item.title,
    summary: item.summary,
    source: item.source,
    date: item.date,
    owner: item.owner,
    linkedResultId: item.linkedResultId,
    linkedFeedbackId: optional(item.linkedFeedbackId),
  }));

  const feedbackItems: Feedback[] = feedbackRows.map((item) => ({
    id: item.id,
    phenomenon: item.phenomenon,
    evidenceIds: evidenceItems.filter((evidenceItem) => evidenceItem.linkedFeedbackId === item.id).map((evidenceItem) => evidenceItem.id),
    causeCategories: causeCategoriesByFeedback.get(item.id) ?? [],
    impact: item.impact,
    linkedObjectiveId: item.linkedObjectiveId,
    linkedResultId: item.linkedResultId,
    suggestedAdjustment: item.suggestedAdjustment,
    source: item.source,
    status: item.status,
    owner: item.owner,
    createdBy: item.createdBy,
    updatedBy: item.updatedBy,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    activity: [],
  }));

  const resultItems: Result[] = orderedResultRows.map((result) => ({
    id: result.id,
    objectiveId: result.objectiveId,
    title: result.title,
    description: result.description,
    metricName: result.metricName,
    metricRequirement: optional(result.metricRequirement),
    statisticalObject: optional(result.statisticalObject),
    completionStandard: optional(result.completionStandard),
    sampleSet: optional(result.sampleSet),
    measurementScope: optional(result.measurementScope),
    uncertaintyLevel: optional(result.uncertaintyLevel),
    baseline: result.baseline,
    current: result.current,
    target: result.target,
    unit: result.unit,
    direction: result.direction,
    status: result.status,
    confidence: result.confidence,
    source: result.source,
    definer: result.definer,
    uncertaintyScore: result.uncertaintyScore ?? uncertaintyScore(result.uncertaintyLevel),
    acceptedResult: result.acceptedResult ?? "unreviewed",
    evidenceIds: evidenceItems.filter((item) => item.linkedResultId === result.id).map((item) => item.id),
    taskIds: taskItems.filter((task) => task.linkedResultId === result.id).map((task) => task.id),
    feedbackIds: feedbackItems.filter((item) => item.linkedResultId === result.id).map((item) => item.id),
    trend: trendByResult.get(result.id) ?? [],
    reviewCadence: result.reviewCadence,
  }));

  const objectiveItems: Objective[] = objectiveRows.map((objective) => {
    const objectiveResults = resultItems.filter((result) => result.objectiveId === objective.id);
    const objectiveBasePoints = objectiveResults.reduce((sum, result) => sum + result.uncertaintyScore, 0);
    const challengers = uniqueMembers(objective.challengers ?? []);
    const assignedChallengers = uniqueMembers(objective.assignedChallengers ?? []).filter((member) => !challengers.includes(member));

    return {
      id: objective.id,
      title: objective.title,
      description: objective.description,
      whyItMatters: objective.whyItMatters,
      cycle: objective.cycle,
      stage: objective.stage,
      flowStatus: objective.flowStatus,
      status: objective.status,
      confidence: objective.confidence,
      progress: Math.max(0, Math.min(100, Math.round(objective.progress))),
      boundary: objective.boundary,
      successDefinition: objective.successDefinition,
      resultIds: objectiveResults.map((result) => result.id),
      feedbackIds: feedbackItems.filter((item) => item.linkedObjectiveId === objective.id).map((item) => item.id),
      taskIds: taskItems.filter((task) => task.linkedObjectiveId === objective.id).map((task) => task.id),
      finalDueAt: objective.finalDueAt || addDays(objective.updatedAt, 14),
      challengers,
      assignedChallengers,
      challengeApplications: objective.challengeApplications,
      acceptedAt: objective.acceptedAt,
      confirmationDueAt: objective.confirmationDueAt,
      confirmedAt: objective.confirmedAt,
      lootSubmittedAt: objective.lootSubmittedAt,
      acceptedResult: objective.acceptedResult,
      completionMultiplier: objective.completionMultiplier,
      objectiveBasePoints,
      objectiveSettlementPoints: objective.objectiveSettlementPoints,
      createdAt: objective.createdAt,
      updatedAt: objective.updatedAt,
    };
  });
  const objectiveLootItems: ObjectiveLoot[] = objectiveLootRows
    .sort((left, right) => right.submittedAt.localeCompare(left.submittedAt))
    .map((item) => ({
      id: item.id,
      objectiveId: item.objectiveId,
      submittedBy: item.submittedBy,
      body: item.body,
      resultClaims: item.resultClaims,
      selfTestReportUrl: item.selfTestReportUrl,
      selfTestReportBody: item.selfTestReportBody,
      submittedAt: item.submittedAt,
    }));
  const objectiveContributionReviewItems: ObjectiveContributionReview[] = objectiveContributionReviewRows
    .sort((left, right) => right.submittedAt.localeCompare(left.submittedAt))
    .map((item) => ({
      id: item.id,
      objectiveId: item.objectiveId,
      reviewer: item.reviewer,
      allocations: item.allocations,
      submittedAt: item.submittedAt,
    }));
  const pointLedgerItems: PointLedgerEntry[] = pointLedgerRows
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .map((item) => ({
      id: item.id,
      objectiveId: item.objectiveId,
      userId: item.userId,
      memberName: item.memberName,
      points: item.points,
      reason: item.reason,
      createdAt: item.createdAt,
    }));
  const commentItems: CommentThread[] = [...commentThreadRows]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .map((thread) => ({
      id: thread.id,
      targetType: thread.targetType,
      targetId: thread.targetId,
      targetTitle: thread.targetTitle,
      status: thread.status,
      createdBy: thread.createdBy,
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt,
      messages: messagesByThread.get(thread.id) ?? [],
    }));

  return {
    objectives: objectiveItems,
    results: resultItems,
    tasks: taskItems,
    evidence: evidenceItems,
    feedback: feedbackItems,
    comments: commentItems,
    objectiveLoot: objectiveLootItems,
    objectiveContributionReviews: objectiveContributionReviewItems,
    pointLedger: pointLedgerItems,
    permissionRules,
  };
}

export async function getOrfStateSnapshot(scope: TaskManagementDataScope = {}): Promise<OrfState> {
  const storageScopeId = scopedStorageId(scope);
  const data = await getTaskManagementData(scope);
  const [scopeRow] = storageScopeId
    ? await db.select({ id: teams.id }).from(teams).where(eq(teams.id, storageScopeId)).limit(1)
    : await db.select({ id: teams.id }).from(teams).limit(1);
  const scopeUsers = scopeRow ? await getScopedUsers(runtimeScope(scopeRow.id)) : initialOrfState.users;

  return {
    ...data,
    users: scopeUsers,
    currentUserId: scopeUsers[0]?.id ?? initialOrfState.currentUserId,
    decisions: [],
    evalRuns: [],
    scenarios: [],
    failureSamples: [],
    comments: data.comments,
    causeCategories: Array.from(new Set(data.feedback.flatMap((item) => item.causeCategories))),
    rules: {
      requireResultForTask: true,
      requireEvidenceForFeedback: true,
      weeklyFeedbackCadence: true,
      autoCreateReviewSummary: false,
    },
  };
}

export type BountyHallItem = {
  uncertaintyPoints: number;
  deadline: string;
  definer: string;
  difficultyRank: number;
  hasCurrentApplication: boolean;
  isRecruitment: boolean;
  objective: Objective;
  result: Result | null;
  results: Result[];
  source: BountySource;
};

export type BountyHallData = {
  recruitmentItems: BountyHallItem[];
  availableItems: BountyHallItem[];
  objectiveOptions: Objective[];
  contribution: { points: number };
};

function resultDifficultyRank(result: Result) {
  return result.uncertaintyLevel ? difficultyRanks[result.uncertaintyLevel] : difficultyRanks["进阶"];
}

function bountySortTitle(item: BountyHallItem) {
  return item.result?.title ?? item.objective.title;
}

function compareBountyItems(left: BountyHallItem, right: BountyHallItem) {
  const leftDeadline = left.deadline || "9999-12-31";
  const rightDeadline = right.deadline || "9999-12-31";
  return leftDeadline.localeCompare(rightDeadline) || right.uncertaintyPoints - left.uncertaintyPoints || bountySortTitle(left).localeCompare(bountySortTitle(right));
}

function objectiveClosedForBountyHall(objective: Objective) {
  return !bountyHallFlowStatuses.has(objective.flowStatus) || isObjectiveTerminal(objective);
}

function objectiveAcceptedForBountyHall(objective: Objective) {
  return objective.challengers.length > 0 || objective.flowStatus === "reestimating" || objective.flowStatus === "frozen";
}

function contributionSummaryFor(data: TaskManagementData, member: string) {
  const ledgerPoints = data.pointLedger
    .filter((entry) => entry.memberName === member)
    .reduce((sum, entry) => sum + entry.points, 0);
  if (ledgerPoints > 0) {
    return { points: ledgerPoints };
  }

  return {
    points: data.objectives.reduce((sum, objective) => {
      if (!objective.challengers.includes(member)) return sum;
      return sum + (objective.objectiveSettlementPoints ?? 0);
    }, 0),
  };
}

export async function getBountyHallData(member: string, scope: TaskManagementDataScope = {}): Promise<BountyHallData> {
  const data = await getTaskManagementData(scope);
  const items = data.objectives.flatMap((objective) => {
    const objectiveResults = data.results.filter((result) => result.objectiveId === objective.id);
    const result = objectiveResults[0];
    const isRecruitment = objective.assignedChallengers.includes(member) && challengeAcceptanceFlowStatuses.has(objective.flowStatus);
    if (objectiveClosedForBountyHall(objective) && !isRecruitment) return [];
    if (objectiveAcceptedForBountyHall(objective) && !isRecruitment) return [];

    const pendingApplications = (objective.challengeApplications ?? []).filter((application) => application.status === "pending");
    return [{
      uncertaintyPoints: objectiveResults.reduce((sum, item) => sum + item.uncertaintyScore, 0),
      deadline: objective.finalDueAt,
      definer: result?.definer ?? "",
      difficultyRank: objectiveResults.length > 0 ? Math.max(...objectiveResults.map(resultDifficultyRank)) : 0,
      hasCurrentApplication: pendingApplications.some((application) => application.applicant === member),
      isRecruitment,
      objective,
      result: result ?? null,
      results: objectiveResults,
      source: result?.source ?? "managerDefined",
    }];
  }).sort(compareBountyItems);

  const availableItems = items.filter((item) => !item.isRecruitment);
  const objectiveOptionIds = new Set(availableItems.map((item) => item.objective.id));

  return {
    recruitmentItems: items.filter((item) => item.isRecruitment),
    availableItems,
    objectiveOptions: data.objectives.filter((objective) => objectiveOptionIds.has(objective.id)),
    contribution: contributionSummaryFor(data, member),
  };
}

function filterComments(data: TaskManagementData, ids: {
  objectiveIds: Set<string>;
  resultIds: Set<string>;
  taskIds: Set<string>;
  checklistItemIds: Set<string>;
}) {
  return data.comments.filter((thread) => {
    if (thread.targetType === "objective") return ids.objectiveIds.has(thread.targetId);
    if (thread.targetType === "result") return ids.resultIds.has(thread.targetId);
    if (thread.targetType === "task") return ids.taskIds.has(thread.targetId);
    if (thread.targetType === "subtask") return ids.checklistItemIds.has(thread.targetId);
    return false;
  });
}

export async function getMyChallengesData(member: string, includeAll = false, scope: TaskManagementDataScope = {}): Promise<TaskManagementData> {
  const data = await getTaskManagementData(scope);
  if (includeAll) return data;

  const objectivesForMember = data.objectives.filter((objective) => objective.challengers.includes(member));
  const objectiveIds = new Set(objectivesForMember.map((objective) => objective.id));
  const resultsForMember = data.results.filter((result) => objectiveIds.has(result.objectiveId));
  const resultIds = new Set(resultsForMember.map((result) => result.id));
  const tasksForMember = data.tasks.filter((task) => objectiveIds.has(task.linkedObjectiveId) || resultIds.has(task.linkedResultId));
  const taskIds = new Set(tasksForMember.map((task) => task.id));
  const checklistItemIds = new Set(tasksForMember.flatMap((task) => task.checklist.map((item) => item.id)));

  return {
    objectives: objectivesForMember,
    results: resultsForMember,
    tasks: tasksForMember,
    evidence: data.evidence.filter((item) => resultIds.has(item.linkedResultId)),
    feedback: data.feedback.filter((item) => objectiveIds.has(item.linkedObjectiveId) || resultIds.has(item.linkedResultId)),
    comments: filterComments(data, { objectiveIds, resultIds, taskIds, checklistItemIds }),
    objectiveLoot: data.objectiveLoot.filter((item) => objectiveIds.has(item.objectiveId)),
    objectiveContributionReviews: data.objectiveContributionReviews.filter((item) => objectiveIds.has(item.objectiveId)),
    pointLedger: data.pointLedger.filter((item) => objectiveIds.has(item.objectiveId)),
    permissionRules: data.permissionRules,
  };
}

export interface CreateResultInput {
  objectiveId: string;
  title: string;
  metricName: string;
  description?: string;
  baseline?: number;
  current?: number;
  target?: number;
  unit?: string;
  direction?: MetricDirection;
  uncertaintyLevel?: UncertaintyLevel;
  source?: BountySource;
  definer?: string;
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  assignee?: string;
  priority?: Priority;
  linkedObjectiveId?: string;
  linkedResultId: string;
  dueDate?: string;
  feedbackOriginId?: string;
}

export interface CreateObjectiveInput {
  title: string;
  whyItMatters: string;
  cycle: string;
  boundary: string;
  finalDueAt?: string;
}

export async function createObjective(input: CreateObjectiveInput, context: { scope: RuntimeScope; userId: string }): Promise<Objective | null> {
  const id = makeId("obj");
  const now = today();
  const storageScopeId = runtimeScopeStorageId(context.scope);

  await db.insert(objectives).values({
    id,
    teamId: storageScopeId,
    title: input.title,
    description: input.whyItMatters,
    whyItMatters: input.whyItMatters,
    cycle: input.cycle,
    stage: "orfReestimate",
    flowStatus: "candidate",
    status: "Draft",
    confidence: 50,
    progress: 0,
    boundary: input.boundary,
    successDefinition: "Success definition will be refined during result planning.",
    finalDueAt: input.finalDueAt ?? addDays(now, 14),
    challengers: [],
    assignedChallengers: [],
    challengeApplications: [],
    acceptedAt: null,
    confirmationDueAt: null,
    confirmedAt: null,
    lootSubmittedAt: null,
    acceptedResult: null,
    completionMultiplier: null,
    objectiveBasePoints: 0,
    objectiveSettlementPoints: null,
    createdAt: now,
    updatedAt: now,
    createdBy: context.userId,
    updatedBy: context.userId,
  });

  const data = await getTaskManagementData({ scope: context.scope });
  return data.objectives.find((objective) => objective.id === id) ?? null;
}

export interface CreateChecklistItemInput {
  label?: string;
  afterItemId?: string;
}

export async function createResult(input: CreateResultInput): Promise<Result | null> {
  const title = input.title.trim();
  const metricName = input.metricName.trim();
  if (!title || !metricName) {
    return null;
  }

  const created = await db.transaction(async (tx) => {
    const [objective] = await tx.select().from(objectives).where(eq(objectives.id, input.objectiveId)).limit(1).for("update");
    if (!objective) {
      return null;
    }
    if (!resultMutationFlowStatuses.has(objective.flowStatus)) {
      return null;
    }

    const siblingRows = await tx.select({ sortOrder: results.sortOrder }).from(results).where(eq(results.objectiveId, input.objectiveId));
    const sortOrder = siblingRows.reduce((max, row) => Math.max(max, row.sortOrder), -1) + 1;
    const id = makeId("res");

    await tx.insert(results).values({
      id,
      teamId: objective.teamId,
      objectiveId: objective.id,
      title,
      description: input.description?.trim() || "由 ORF Flow 规划创建的指标。",
      metricName,
      metricRequirement: `${metricName}：写清统计对象和完成标准后进入执行。`,
      statisticalObject: null,
      completionStandard: null,
      sampleSet: null,
      measurementScope: null,
      uncertaintyLevel: input.uncertaintyLevel ?? null,
      baseline: input.baseline ?? 0,
      current: input.current ?? 0,
      target: input.target ?? 100,
      unit: input.unit?.trim() || "%",
      direction: input.direction ?? "increase",
      status: "Draft",
      confidence: 50,
      source: input.source ?? "managerDefined",
      definer: input.definer?.trim() || "",
      uncertaintyScore: uncertaintyScore(input.uncertaintyLevel ?? null),
      acceptedResult: "unreviewed",
      reviewCadence: "Weekly",
      sortOrder,
    });

    return { id, scope: runtimeScope(objective.teamId) };
  });

  if (!created) {
    return null;
  }

  const data = await getTaskManagementData({ scope: created.scope });
  return data.results.find((result) => result.id === created.id) ?? null;
}

export type AcceptObjectiveChallengeOutcome =
  | { status: "accepted"; objective: Objective }
  | { status: "alreadyAccepted"; challengers: string[] }
  | { status: "forbidden" }
  | { status: "invalidDueDate" }
  | { status: "closed" }
  | { status: "notFound" };

export async function acceptObjectiveChallenge(objectiveId: string, challenger: string, actorId?: string): Promise<AcceptObjectiveChallengeOutcome> {
  const nextChallenger = challenger.trim();
  if (!nextChallenger) {
    return { status: "notFound" };
  }

  const acceptedResult = await db.transaction(async (tx) => {
    const [objective] = await tx.select().from(objectives).where(eq(objectives.id, objectiveId)).limit(1).for("update");
    if (!objective) {
      return { status: "notFound" as const };
    }

    const currentChallengers = uniqueMembers(objective.challengers ?? []);
    if (currentChallengers.includes(nextChallenger)) {
      return { status: "alreadyAccepted" as const, challengers: currentChallengers };
    }
    if (isObjectiveTerminal(objective) || !challengeAcceptanceFlowStatuses.has(objective.flowStatus)) {
      return { status: "closed" as const };
    }

    const assignedChallengers = uniqueMembers(objective.assignedChallengers ?? []);
    const applications = objective.challengeApplications ?? [];
    const hasApprovedApplication = applications.some((application) => application.applicant === nextChallenger && application.status === "approved");
    if (!assignedChallengers.includes(nextChallenger) && !hasApprovedApplication) {
      return { status: "forbidden" as const };
    }

    const acceptedAt = nowIso();
    const nextConfirmationDueAt = confirmationDueAt(objective.finalDueAt, acceptedAt);
    if (!nextConfirmationDueAt) {
      return { status: "invalidDueDate" as const };
    }

    await tx
      .update(objectives)
      .set({
        challengers: [...currentChallengers, nextChallenger],
        assignedChallengers: assignedChallengers.filter((member) => member !== nextChallenger),
        flowStatus: "reestimating",
        stage: "orfReestimate",
        acceptedAt: objective.acceptedAt ?? acceptedAt,
        confirmationDueAt: objective.confirmationDueAt ?? nextConfirmationDueAt,
        challengeApplications: applications.map((application) =>
          application.applicant === nextChallenger && application.status === "approved" ? { ...application, decidedAt: application.decidedAt ?? acceptedAt } : application,
        ),
        status: objective.status === "Draft" ? "On Track" : objective.status,
        updatedAt: today(),
        updatedBy: actorId ?? objective.updatedBy,
      })
      .where(eq(objectives.id, objectiveId));

    return { status: "accepted" as const, scope: runtimeScope(objective.teamId) };
  });

  if (acceptedResult.status !== "accepted") {
    return acceptedResult;
  }

  const data = await getTaskManagementData({ scope: acceptedResult.scope });
  const accepted = data.objectives.find((item) => item.id === objectiveId);
  return accepted ? { status: "accepted", objective: accepted } : { status: "notFound" };
}

export type ApplyObjectiveChallengeOutcome =
  | { status: "applied"; objective: Objective }
  | { status: "alreadyApplied" }
  | { status: "alreadyAccepted"; challengers: string[] }
  | { status: "closed" }
  | { status: "notFound" };

export async function applyForObjectiveChallenge(objectiveId: string, applicant: string): Promise<ApplyObjectiveChallengeOutcome> {
  const nextApplicant = applicant.trim();
  if (!nextApplicant) {
    return { status: "notFound" };
  }

  const appliedResult = await db.transaction(async (tx) => {
    const [objective] = await tx.select().from(objectives).where(eq(objectives.id, objectiveId)).limit(1).for("update");
    if (!objective) {
      return { status: "notFound" as const };
    }

    const challengers = uniqueMembers(objective.challengers ?? []);
    if (challengers.includes(nextApplicant)) {
      return { status: "alreadyAccepted" as const, challengers };
    }
    if (isObjectiveTerminal(objective) || !bountyHallFlowStatuses.has(objective.flowStatus)) {
      return { status: "closed" as const };
    }

    const applications = objective.challengeApplications ?? [];
    if (applications.some((application) => application.applicant === nextApplicant && application.status === "pending")) {
      return { status: "alreadyApplied" as const };
    }

    const application: ChallengeApplication = {
      id: makeId("challenge-application"),
      applicant: nextApplicant,
      status: "pending",
      createdAt: nowIso(),
      decidedAt: null,
    };

    await tx
      .update(objectives)
      .set({
        challengeApplications: [application, ...applications],
        flowStatus: objective.flowStatus === "recruiting" ? "recruiting" : "applying",
        updatedAt: today(),
      })
      .where(eq(objectives.id, objectiveId));

    return { status: "applied" as const, scope: runtimeScope(objective.teamId) };
  });

  if (appliedResult.status !== "applied") {
    return appliedResult;
  }

  const data = await getTaskManagementData({ scope: appliedResult.scope });
  const applied = data.objectives.find((item) => item.id === objectiveId);
  return applied ? { status: "applied", objective: applied } : { status: "notFound" };
}

export type ObjectiveFlowMutationOutcome =
  | { status: "ok"; objective: Objective }
  | { status: "invalid" }
  | { status: "notFound" };

async function objectiveOutcome(objectiveId: string, scope?: RuntimeScope | null): Promise<ObjectiveFlowMutationOutcome> {
  const data = await getTaskManagementData({ scope });
  const objective = data.objectives.find((item) => item.id === objectiveId);
  return objective ? { status: "ok", objective } : { status: "notFound" };
}

export async function publishObjective(objectiveId: string, actorId: string): Promise<ObjectiveFlowMutationOutcome> {
  const updated = await db
    .update(objectives)
    .set({ flowStatus: "open", stage: "resultClaiming", status: "Draft", updatedAt: today(), updatedBy: actorId })
    .where(and(eq(objectives.id, objectiveId), eq(objectives.flowStatus, "candidate")))
    .returning({ id: objectives.id, teamId: objectives.teamId });
  if (updated.length === 0) {
    const [existing] = await db.select({ id: objectives.id }).from(objectives).where(eq(objectives.id, objectiveId)).limit(1);
    return existing ? { status: "invalid" } : { status: "notFound" };
  }
  return objectiveOutcome(objectiveId, storageScope(updated[0]?.teamId));
}

export async function approveObjectiveChallengeApplication(
  objectiveId: string,
  applicationId: string,
  actorId: string,
): Promise<ObjectiveFlowMutationOutcome> {
  const approvedResult = await db.transaction(async (tx) => {
    const [objective] = await tx.select().from(objectives).where(eq(objectives.id, objectiveId)).limit(1).for("update");
    if (!objective) return { status: "notFound" as const };
    if (isObjectiveTerminal(objective) || !applicationReviewFlowStatuses.has(objective.flowStatus)) return { status: "invalid" as const };

    const applications = objective.challengeApplications ?? [];
    const application = applications.find((item) => item.id === applicationId && item.status === "pending");
    if (!application) return { status: "notFound" as const };

    const acceptedAt = nowIso();
    const nextConfirmationDueAt = confirmationDueAt(objective.finalDueAt, acceptedAt);
    if (!nextConfirmationDueAt) return { status: "invalid" as const };

    const challengers = uniqueMembers([...(objective.challengers ?? []), application.applicant]);
    await tx
      .update(objectives)
      .set({
        challengers,
        flowStatus: "reestimating",
        stage: "orfReestimate",
        acceptedAt: objective.acceptedAt ?? acceptedAt,
        confirmationDueAt: objective.confirmationDueAt ?? nextConfirmationDueAt,
        challengeApplications: applications.map((item) =>
          item.id === applicationId ? { ...item, status: "approved", decidedAt: acceptedAt, decidedBy: actorId } : item,
        ),
        status: objective.status === "Draft" ? "On Track" : objective.status,
        updatedAt: today(),
        updatedBy: actorId,
      })
      .where(eq(objectives.id, objectiveId));

    return { status: "ok" as const, scope: runtimeScope(objective.teamId) };
  });

  return approvedResult.status === "ok" ? objectiveOutcome(objectiveId, approvedResult.scope) : approvedResult;
}

export async function rejectObjectiveChallengeApplication(
  objectiveId: string,
  applicationId: string,
  actorId: string,
): Promise<ObjectiveFlowMutationOutcome> {
  const rejectedResult = await db.transaction(async (tx) => {
    const [objective] = await tx.select().from(objectives).where(eq(objectives.id, objectiveId)).limit(1).for("update");
    if (!objective) return { status: "notFound" as const };
    if (isObjectiveTerminal(objective) || !applicationReviewFlowStatuses.has(objective.flowStatus)) return { status: "invalid" as const };
    const applications = objective.challengeApplications ?? [];
    if (!applications.some((item) => item.id === applicationId && item.status === "pending")) return { status: "notFound" as const };
    const nextApplications = applications.map((item) =>
      item.id === applicationId ? { ...item, status: "declined" as const, decidedAt: nowIso(), decidedBy: actorId } : item,
    );
    const hasPending = nextApplications.some((item) => item.status === "pending");
    const assignedChallengers = uniqueMembers(objective.assignedChallengers ?? []);
    const challengers = uniqueMembers(objective.challengers ?? []);
    await tx
      .update(objectives)
      .set({
        challengeApplications: nextApplications,
        flowStatus: challengers.length > 0 ? "reestimating" : assignedChallengers.length > 0 ? "recruiting" : hasPending ? "applying" : "open",
        updatedAt: today(),
        updatedBy: actorId,
      })
      .where(eq(objectives.id, objectiveId));
    return { status: "ok" as const, scope: runtimeScope(objective.teamId) };
  });

  return rejectedResult.status === "ok" ? objectiveOutcome(objectiveId, rejectedResult.scope) : rejectedResult;
}

export async function recruitObjectiveChallengers(
  objectiveId: string,
  members: string[],
  actorId: string,
): Promise<ObjectiveFlowMutationOutcome> {
  const recruitedResult = await db.transaction(async (tx) => {
    const [objective] = await tx.select().from(objectives).where(eq(objectives.id, objectiveId)).limit(1).for("update");
    if (!objective) return { status: "notFound" as const };
    if (isObjectiveTerminal(objective) || !challengeRecruitmentFlowStatuses.has(objective.flowStatus)) return { status: "invalid" as const };
    const currentChallengers = uniqueMembers(objective.challengers ?? []);
    const recruitMembers = uniqueMembers(members).filter((member) => !currentChallengers.includes(member));
    if (recruitMembers.length === 0) return { status: "invalid" as const };
    const activeMembers = await tx
      .select({ name: users.name })
      .from(teamMembers)
      .innerJoin(users, eq(teamMembers.userId, users.id))
      .where(and(eq(teamMembers.teamId, objective.teamId), eq(users.status, "active"), inArray(users.name, recruitMembers)));
    const activeMemberNames = new Set(activeMembers.map((member) => member.name));
    if (recruitMembers.some((member) => !activeMemberNames.has(member))) return { status: "invalid" as const };
    const assignedChallengers = uniqueMembers([...(objective.assignedChallengers ?? []), ...recruitMembers]).filter((member) => !currentChallengers.includes(member));
    if (assignedChallengers.length === 0) return { status: "invalid" as const };
    await tx
      .update(objectives)
      .set({
        assignedChallengers,
        flowStatus: currentChallengers.length > 0 || objective.flowStatus === "reestimating" ? "reestimating" : "recruiting",
        updatedAt: today(),
        updatedBy: actorId,
      })
      .where(eq(objectives.id, objectiveId));
    return { status: "ok" as const, scope: runtimeScope(objective.teamId) };
  });

  return recruitedResult.status === "ok" ? objectiveOutcome(objectiveId, recruitedResult.scope) : recruitedResult;
}

export async function declineObjectiveChallenge(objectiveId: string, member: string, actorId: string): Promise<ObjectiveFlowMutationOutcome> {
  const nextMember = member.trim();
  if (!nextMember) return { status: "invalid" };

  const declinedResult = await db.transaction(async (tx) => {
    const [objective] = await tx.select().from(objectives).where(eq(objectives.id, objectiveId)).limit(1).for("update");
    if (!objective) return { status: "notFound" as const };
    if (!challengeAcceptanceFlowStatuses.has(objective.flowStatus)) return { status: "invalid" as const };

    const assignedChallengers = uniqueMembers(objective.assignedChallengers ?? []);
    if (!assignedChallengers.includes(nextMember)) return { status: "invalid" as const };

    const nextAssigned = assignedChallengers.filter((item) => item !== nextMember);
    const applications = objective.challengeApplications ?? [];
    const challengers = uniqueMembers(objective.challengers ?? []);
    await tx
      .update(objectives)
      .set({
        assignedChallengers: nextAssigned,
        challengeApplications: applications,
        flowStatus: challengers.length > 0 ? "reestimating" : nextAssigned.length > 0 ? "recruiting" : applications.some((item) => item.status === "pending") ? "applying" : "open",
        updatedAt: today(),
        updatedBy: actorId,
      })
      .where(eq(objectives.id, objectiveId));
    return { status: "ok" as const, scope: runtimeScope(objective.teamId) };
  });

  return declinedResult.status === "ok" ? objectiveOutcome(objectiveId, declinedResult.scope) : declinedResult;
}

export async function freezeObjectiveAfterReestimate(objectiveId: string, actorId: string): Promise<ObjectiveFlowMutationOutcome> {
  const frozen = await db.transaction(async (tx) => {
    const [objective] = await tx.select().from(objectives).where(eq(objectives.id, objectiveId)).limit(1).for("update");
    if (!objective) return { status: "notFound" as const };
    if (objective.flowStatus !== "reestimating") return { status: "invalid" as const };

    const objectiveResults = await tx.select({ id: results.id }).from(results).where(eq(results.objectiveId, objectiveId)).limit(1);
    if (objectiveResults.length === 0) return { status: "invalid" as const };

    const decidedAt = nowIso();
    const challengeApplications = (objective.challengeApplications ?? []).map((application) =>
      application.status === "pending"
        ? { ...application, status: "declined" as const, decidedAt, decidedBy: actorId }
        : application,
    );

    await tx
      .update(objectives)
      .set({
        assignedChallengers: [],
        challengeApplications,
        flowStatus: "frozen",
        stage: "goalFrozen",
        confirmedAt: decidedAt,
        updatedAt: today(),
        updatedBy: actorId,
      })
      .where(eq(objectives.id, objectiveId));

    return { status: "ok" as const, scope: runtimeScope(objective.teamId) };
  });

  return frozen.status === "ok" ? objectiveOutcome(objectiveId, frozen.scope) : frozen;
}

export async function reopenObjectiveReestimate(_objectiveId: string, _actorId: string): Promise<ObjectiveFlowMutationOutcome> {
  // Reestimate is a bounded adjustment window. Once it expires or the objective is frozen, this flow intentionally stays closed.
  return { status: "invalid" };
}

export async function canEditResultDuringReestimate(resultId: string, member: string): Promise<boolean> {
  const actorName = member.trim();
  if (!actorName) return false;

  const [row] = await db
    .select({
      flowStatus: objectives.flowStatus,
      challengers: objectives.challengers,
      confirmationDueAt: objectives.confirmationDueAt,
    })
    .from(results)
    .innerJoin(objectives, eq(objectives.id, results.objectiveId))
    .where(eq(results.id, resultId))
    .limit(1);

  return row?.flowStatus === "reestimating" && uniqueMembers(row.challengers ?? []).includes(actorName) && isReestimateWindowOpen(row.confirmationDueAt);
}

export type ObjectiveStateMutationAccess =
  | { status: "allowed"; flowStatus: Objective["flowStatus"] }
  | { status: "locked"; flowStatus: Objective["flowStatus"] }
  | { status: "notFound" };

export async function canMutateObjectiveResults(objectiveId: string): Promise<ObjectiveStateMutationAccess> {
  const [objective] = await db
    .select({ flowStatus: objectives.flowStatus })
    .from(objectives)
    .where(eq(objectives.id, objectiveId))
    .limit(1);
  if (!objective) {
    return { status: "notFound" };
  }

  return resultMutationFlowStatuses.has(objective.flowStatus)
    ? { status: "allowed", flowStatus: objective.flowStatus }
    : { status: "locked", flowStatus: objective.flowStatus };
}

export async function canMutateResult(resultId: string): Promise<ObjectiveStateMutationAccess> {
  const [row] = await db
    .select({ flowStatus: objectives.flowStatus })
    .from(results)
    .innerJoin(objectives, eq(objectives.id, results.objectiveId))
    .where(eq(results.id, resultId))
    .limit(1);
  if (!row) {
    return { status: "notFound" };
  }

  return resultMutationFlowStatuses.has(row.flowStatus)
    ? { status: "allowed", flowStatus: row.flowStatus }
    : { status: "locked", flowStatus: row.flowStatus };
}

export async function canDeleteObjective(objectiveId: string): Promise<ObjectiveStateMutationAccess> {
  const [objective] = await db
    .select({ flowStatus: objectives.flowStatus })
    .from(objectives)
    .where(eq(objectives.id, objectiveId))
    .limit(1);
  if (!objective) {
    return { status: "notFound" };
  }

  return objectiveDeleteLockedFlowStatuses.has(objective.flowStatus)
    ? { status: "locked", flowStatus: objective.flowStatus }
    : { status: "allowed", flowStatus: objective.flowStatus };
}

export async function canEditObjectiveResultsDuringReestimate(objectiveId: string, member: string, scope?: RuntimeScope | null): Promise<boolean> {
  const actorName = member.trim();
  if (!actorName) return false;
  const storageScopeId = scope ? runtimeScopeStorageId(scope) : "";

  const [objective] = await db
    .select({
      flowStatus: objectives.flowStatus,
      challengers: objectives.challengers,
      confirmationDueAt: objectives.confirmationDueAt,
      teamId: objectives.teamId,
    })
    .from(objectives)
    .where(eq(objectives.id, objectiveId))
    .limit(1);

  return (
    objective?.flowStatus === "reestimating" &&
    (!storageScopeId || objective.teamId === storageScopeId) &&
    uniqueMembers(objective.challengers ?? []).includes(actorName) &&
    isReestimateWindowOpen(objective.confirmationDueAt)
  );
}

export type CreateFeedbackInput = Pick<
  Feedback,
  "phenomenon" | "causeCategories" | "impact" | "linkedResultId" | "suggestedAdjustment" | "source" | "owner"
>;
export type CreateFeedbackOutcome =
  | { status: "ok"; feedback: Feedback }
  | { status: "notFound" }
  | { status: "invalidOwner" };

export async function canCreateFeedbackForResult(
  resultId: string,
  actor: Pick<CommentActor, "name" | "role" | "scope">,
): Promise<ObjectiveWorkItemMutationOutcome> {
  const storageScopeId = actor.scope ? runtimeScopeStorageId(actor.scope) : "";
  const [target] = await db
    .select({ objectiveId: results.objectiveId, challengers: objectives.challengers, teamId: results.teamId })
    .from(results)
    .innerJoin(objectives, eq(objectives.id, results.objectiveId))
    .where(eq(results.id, resultId))
    .limit(1);
  if (!target) {
    return "notFound";
  }

  if (storageScopeId && target.teamId !== storageScopeId) {
    return "notFound";
  }

  if (actor.role === "admin") {
    return "allowed";
  }

  const member = actor.name.trim();
  return member && uniqueMembers(target.challengers ?? []).includes(member)
    ? "allowed"
    : "forbidden";
}

export async function createFeedback(input: CreateFeedbackInput, actorId: string): Promise<CreateFeedbackOutcome> {
  const [result] = await db.select().from(results).where(eq(results.id, input.linkedResultId)).limit(1);
  if (!result) {
    return { status: "notFound" };
  }

  const owner = input.owner.trim();
  const activeOwnerNames = await getActiveMemberNameSetInScope(result.teamId, [owner]);
  if (!activeOwnerNames.has(owner)) {
    return { status: "invalidOwner" };
  }

  const id = makeId("fb");
  const now = today();
  await db.transaction(async (tx) => {
    await tx.insert(feedback).values({
      id,
      teamId: result.teamId,
      phenomenon: input.phenomenon,
      impact: input.impact,
      linkedObjectiveId: result.objectiveId,
      linkedResultId: result.id,
      suggestedAdjustment: input.suggestedAdjustment,
      source: input.source,
      status: "New",
      owner,
      createdAt: now,
      updatedAt: now,
      createdBy: actorId,
      updatedBy: actorId,
    });

    const categories = input.causeCategories.map((category, index) => ({ feedbackId: id, category, sortOrder: index }));
    if (categories.length > 0) {
      await tx.insert(feedbackCauseCategories).values(categories);
    }
  });

  const data = await getTaskManagementData({ scope: runtimeScope(result.teamId) });
  const item = data.feedback.find((entry) => entry.id === id);
  return item ? { status: "ok", feedback: item } : { status: "notFound" };
}

type FeedbackStatusActor = { id: string; name: string; role: "admin" | "member"; scope?: RuntimeScope | null };

export type FeedbackStatusUpdateResult = { status: "ok" } | { status: "notFound" } | { status: "forbidden" };

function canManageFeedbackStatus(
  item: { owner: string; createdBy: string | null },
  actor: FeedbackStatusActor,
) {
  return actor.role === "admin" || item.createdBy === actor.id || item.owner === actor.name;
}

export async function updateFeedbackStatus(
  feedbackId: string,
  status: FeedbackStatus,
  actor: FeedbackStatusActor,
): Promise<FeedbackStatusUpdateResult> {
  const storageScopeId = actor.scope ? runtimeScopeStorageId(actor.scope) : "";
  const [target] = await db
    .select({ id: feedback.id, owner: feedback.owner, createdBy: feedback.createdBy, teamId: feedback.teamId })
    .from(feedback)
    .where(eq(feedback.id, feedbackId))
    .limit(1);

  if (!target) {
    return { status: "notFound" };
  }

  if (storageScopeId && target.teamId !== storageScopeId) {
    return { status: "notFound" };
  }

  if (!canManageFeedbackStatus(target, actor)) {
    return { status: "forbidden" };
  }

  const updated = await db
    .update(feedback)
    .set({ status, updatedAt: today(), updatedBy: actor.id })
    .where(eq(feedback.id, feedbackId))
    .returning({ id: feedback.id });
  return updated.length > 0 ? { status: "ok" } : { status: "notFound" };
}

export async function updateResultConfidence(resultId: string, confidence: number, actorId: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [target] = await tx
      .select({ flowStatus: objectives.flowStatus })
      .from(results)
      .innerJoin(objectives, eq(objectives.id, results.objectiveId))
      .where(eq(results.id, resultId))
      .limit(1)
      .for("update");
    if (!target || !resultMutationFlowStatuses.has(target.flowStatus)) {
      return false;
    }

    const updated = await tx
      .update(results)
      .set({ confidence, updatedBy: actorId })
      .where(eq(results.id, resultId))
      .returning({ id: results.id });
    return updated.length > 0;
  });
}

export async function proposeResultUpdate(
  input: { resultId: string; title: string; reason: string; feedbackId?: string },
  actor: { id: string; name: string },
): Promise<boolean> {
  const nextTitle = input.title.trim();
  const reason = input.reason.trim();
  if (!nextTitle || !reason) {
    return false;
  }

  return db.transaction(async (tx) => {
    const [target] = await tx
      .select({
        id: results.id,
        teamId: results.teamId,
        flowStatus: objectives.flowStatus,
      })
      .from(results)
      .innerJoin(objectives, eq(objectives.id, results.objectiveId))
      .where(eq(results.id, input.resultId))
      .limit(1)
      .for("update");
    if (!target || !resultMutationFlowStatuses.has(target.flowStatus)) {
      return false;
    }

    if (input.feedbackId) {
      const [linkedFeedback] = await tx
        .select({ id: feedback.id, teamId: feedback.teamId, linkedResultId: feedback.linkedResultId })
        .from(feedback)
        .where(eq(feedback.id, input.feedbackId))
        .limit(1);
      if (!linkedFeedback || linkedFeedback.teamId !== target.teamId || linkedFeedback.linkedResultId !== target.id) {
        return false;
      }
    }

    const updated = await tx
      .update(results)
      .set({ title: nextTitle, updatedBy: actor.id })
      .where(eq(results.id, input.resultId))
      .returning({ id: results.id });
    if (updated.length === 0) {
      return false;
    }

    await tx
      .update(commentThreads)
      .set({ targetTitle: nextTitle, updatedAt: nowIso() })
      .where(and(eq(commentThreads.targetType, "result"), eq(commentThreads.targetId, input.resultId)));

    if (input.feedbackId) {
      await tx
        .update(feedback)
        .set({ status: "Result Updated", updatedAt: today(), updatedBy: actor.id })
        .where(eq(feedback.id, input.feedbackId));
    }

    const threadId = makeId("cthread");
    const messageId = makeId("cmsg");
    const now = nowIso();
    await tx.insert(commentThreads).values({
      id: threadId,
      teamId: target.teamId,
      targetType: "result",
      targetId: target.id,
      targetTitle: nextTitle,
      status: "open",
      createdBy: actor.id,
      createdAt: now,
      updatedAt: now,
    });
    await tx.insert(commentMessages).values({
      id: messageId,
      threadId,
      authorUserId: actor.id,
      author: actor.name,
      body: `指标更新：${nextTitle}\n原因：${reason}`,
      createdAt: now,
      parentMessageId: null,
      replyToMessageId: null,
      replyToAuthor: null,
      sortOrder: 0,
    });

    return true;
  });
}

export interface CreateCommentInput {
  targetType: CommentTargetType;
  targetId: string;
  targetTitle: string;
  body: string;
  parentMessageId?: string;
  replyToMessageId?: string;
  replyToAuthor?: string;
}

type CommentTarget = {
  objectiveId: string;
  storageScopeId: string;
  title: string;
};

export type ObjectiveWorkItemTarget =
  | { type: "objective"; id: string }
  | { type: "result"; id: string }
  | { type: "task"; id: string }
  | { type: "subtask"; id: string; taskId?: string };

export type ObjectiveWorkItemMutationOutcome = "allowed" | "forbidden" | "notFound";

export async function resolveObjectiveIdForWorkItem(target: ObjectiveWorkItemTarget): Promise<string | null> {
  if (target.type === "objective") {
    const [objective] = await db.select({ objectiveId: objectives.id }).from(objectives).where(eq(objectives.id, target.id)).limit(1);
    return objective?.objectiveId ?? null;
  }

  if (target.type === "result") {
    const [result] = await db.select({ objectiveId: results.objectiveId }).from(results).where(eq(results.id, target.id)).limit(1);
    return result?.objectiveId ?? null;
  }

  if (target.type === "task") {
    const [task] = await db.select({ objectiveId: tasks.linkedObjectiveId }).from(tasks).where(eq(tasks.id, target.id)).limit(1);
    return task?.objectiveId ?? null;
  }

  const conditions = target.taskId
    ? and(eq(taskChecklistItems.id, target.id), eq(taskChecklistItems.taskId, target.taskId))
    : eq(taskChecklistItems.id, target.id);
  const [item] = await db
    .select({ objectiveId: tasks.linkedObjectiveId })
    .from(taskChecklistItems)
    .innerJoin(tasks, eq(tasks.id, taskChecklistItems.taskId))
    .where(conditions)
    .limit(1);
  return item?.objectiveId ?? null;
}

export async function resolveRuntimeScopeForWorkItem(target: ObjectiveWorkItemTarget): Promise<RuntimeScope | null> {
  if (target.type === "objective") {
    const [objective] = await db.select({ teamId: objectives.teamId }).from(objectives).where(eq(objectives.id, target.id)).limit(1);
    return storageScope(objective?.teamId);
  }

  if (target.type === "result") {
    const [result] = await db.select({ teamId: results.teamId }).from(results).where(eq(results.id, target.id)).limit(1);
    return storageScope(result?.teamId);
  }

  if (target.type === "task") {
    const [task] = await db.select({ teamId: tasks.teamId }).from(tasks).where(eq(tasks.id, target.id)).limit(1);
    return storageScope(task?.teamId);
  }

  const conditions = target.taskId
    ? and(eq(taskChecklistItems.id, target.id), eq(taskChecklistItems.taskId, target.taskId))
    : eq(taskChecklistItems.id, target.id);
  const [item] = await db
    .select({ teamId: tasks.teamId })
    .from(taskChecklistItems)
    .innerJoin(tasks, eq(tasks.id, taskChecklistItems.taskId))
    .where(conditions)
    .limit(1);
  return storageScope(item?.teamId);
}

export async function resolveRuntimeScopeForFeedback(feedbackId: string): Promise<RuntimeScope | null> {
  const [target] = await db.select({ teamId: feedback.teamId }).from(feedback).where(eq(feedback.id, feedbackId)).limit(1);
  return storageScope(target?.teamId);
}

export async function canMutateObjectiveWorkItem(
  actor: Pick<CommentActor, "name" | "role" | "scope">,
  objectiveId: string,
): Promise<ObjectiveWorkItemMutationOutcome> {
  const storageScopeId = actor.scope ? runtimeScopeStorageId(actor.scope) : "";
  const [objective] = await db
    .select({ challengers: objectives.challengers, flowStatus: objectives.flowStatus, teamId: objectives.teamId })
    .from(objectives)
    .where(eq(objectives.id, objectiveId))
    .limit(1);
  if (!objective) {
    return "notFound";
  }

  if (storageScopeId && objective.teamId !== storageScopeId) {
    return "notFound";
  }

  if (!workItemMutationFlowStatuses.has(objective.flowStatus)) {
    return "forbidden";
  }

  if (actor.role === "admin") {
    return "allowed";
  }

  const member = actor.name.trim();
  return member && uniqueMembers(objective.challengers ?? []).includes(member)
    ? "allowed"
    : "forbidden";
}

async function canMutateObjectiveComment(
  actor: CommentActor,
  objectiveId: string,
): Promise<ObjectiveWorkItemMutationOutcome> {
  const storageScopeId = actor.scope ? runtimeScopeStorageId(actor.scope) : "";
  const [objective] = await db
    .select({ challengers: objectives.challengers, flowStatus: objectives.flowStatus, teamId: objectives.teamId })
    .from(objectives)
    .where(eq(objectives.id, objectiveId))
    .limit(1);
  if (!objective) {
    return "notFound";
  }

  if (storageScopeId && objective.teamId !== storageScopeId) {
    return "notFound";
  }

  if (commentLockedFlowStatuses.has(objective.flowStatus)) {
    return "forbidden";
  }

  if (actor.role === "admin" || actor.canManageAllComments === true) {
    return "allowed";
  }

  const member = actor.name.trim();
  return member &&
    memberCommentFlowStatuses.has(objective.flowStatus) &&
    uniqueMembers(objective.challengers ?? []).includes(member)
    ? "allowed"
    : "forbidden";
}

async function resolveCommentTarget(targetType: CommentTargetType, targetId: string): Promise<CommentTarget | null> {
  if (targetType === "objective") {
    const [target] = await db
      .select({ objectiveId: objectives.id, teamId: objectives.teamId, title: objectives.title })
      .from(objectives)
      .where(eq(objectives.id, targetId))
      .limit(1);
    return target ? { objectiveId: target.objectiveId, storageScopeId: target.teamId, title: target.title } : null;
  }

  if (targetType === "result") {
    const [target] = await db
      .select({ objectiveId: results.objectiveId, teamId: results.teamId, title: results.title })
      .from(results)
      .where(eq(results.id, targetId))
      .limit(1);
    return target ? { objectiveId: target.objectiveId, storageScopeId: target.teamId, title: target.title } : null;
  }

  if (targetType === "task") {
    const [target] = await db
      .select({ objectiveId: tasks.linkedObjectiveId, teamId: tasks.teamId, title: tasks.title })
      .from(tasks)
      .where(eq(tasks.id, targetId))
      .limit(1);
    return target ? { objectiveId: target.objectiveId, storageScopeId: target.teamId, title: target.title } : null;
  }

  const [target] = await db
    .select({ objectiveId: tasks.linkedObjectiveId, teamId: tasks.teamId, title: taskChecklistItems.label })
    .from(taskChecklistItems)
    .innerJoin(tasks, eq(tasks.id, taskChecklistItems.taskId))
    .where(eq(taskChecklistItems.id, targetId))
    .limit(1);
  return target ? { objectiveId: target.objectiveId, storageScopeId: target.teamId, title: target.title } : null;
}

async function getCommentThread(threadId: string): Promise<CommentThread | null> {
  const [thread] = await db.select().from(commentThreads).where(eq(commentThreads.id, threadId)).limit(1);
  if (!thread) {
    return null;
  }

  const messages = await db.select().from(commentMessages).where(eq(commentMessages.threadId, thread.id));
  return {
    id: thread.id,
    targetType: thread.targetType,
    targetId: thread.targetId,
    targetTitle: thread.targetTitle,
    status: thread.status,
    createdBy: thread.createdBy,
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
    messages: messages
      .sort((left, right) => left.sortOrder - right.sortOrder || left.createdAt.localeCompare(right.createdAt))
      .map((message) => ({
        id: message.id,
        author: message.author,
        body: message.body,
        createdAt: message.createdAt,
        parentMessageId: optional(message.parentMessageId),
        replyToMessageId: optional(message.replyToMessageId),
        replyToAuthor: optional(message.replyToAuthor),
      })),
  };
}

function canManageComment(actor: CommentActor, ownerUserId: string) {
  return actor.role === "admin" || actor.canManageAllComments === true || actor.id === ownerUserId;
}

export async function createComment(input: CreateCommentInput, actor: CommentActor): Promise<CommentMutationOutcome> {
  const body = input.body.trim();
  if (!body) {
    return { status: "invalid" };
  }

  const target = await resolveCommentTarget(input.targetType, input.targetId);
  if (!target) {
    return { status: "notFound" };
  }
  const access = await canMutateObjectiveComment(actor, target.objectiveId);
  if (access === "notFound") {
    return { status: "notFound" };
  }
  if (access === "forbidden") {
    return { status: "forbidden" };
  }

  const targetTitle = target.title;
  const createdAt = nowIso();
  const threadId = await db.transaction(async (tx) => {
    const [lockedObjective] = await tx
      .select({ id: objectives.id })
      .from(objectives)
      .where(eq(objectives.id, target.objectiveId))
      .limit(1)
      .for("update");
    if (!lockedObjective) {
      return null;
    }

    if (input.parentMessageId) {
      const [parent] = await tx
        .select({ threadId: commentMessages.threadId })
        .from(commentMessages)
        .innerJoin(commentThreads, eq(commentThreads.id, commentMessages.threadId))
        .where(
          and(
            eq(commentMessages.id, input.parentMessageId),
            eq(commentThreads.targetType, input.targetType),
            eq(commentThreads.targetId, input.targetId),
          ),
        )
        .limit(1);

      if (!parent) {
        return null;
      }

      let replyToMessageId: string | null = null;
      let replyToAuthor: string | null = null;
      if (input.replyToMessageId) {
        const [replyTarget] = await tx
          .select({ id: commentMessages.id, author: commentMessages.author })
          .from(commentMessages)
          .where(and(eq(commentMessages.threadId, parent.threadId), eq(commentMessages.id, input.replyToMessageId)))
          .limit(1);
        if (!replyTarget) {
          return null;
        }
        replyToMessageId = replyTarget.id;
        replyToAuthor = replyTarget.author;
      }

      const messageRows = await tx
        .select({ sortOrder: commentMessages.sortOrder })
        .from(commentMessages)
        .where(eq(commentMessages.threadId, parent.threadId));
      const sortOrder = messageRows.reduce((max, message) => Math.max(max, message.sortOrder), -1) + 1;

      await tx.insert(commentMessages).values({
        id: makeId("cmsg"),
        threadId: parent.threadId,
        authorUserId: actor.id,
        author: actor.name,
        body,
        createdAt,
        parentMessageId: input.parentMessageId,
        replyToMessageId,
        replyToAuthor,
        sortOrder,
      });
      await tx.update(commentThreads).set({ targetTitle, updatedAt: createdAt }).where(eq(commentThreads.id, parent.threadId));
      return parent.threadId;
    }

    const [openThread] = await tx
      .select({ id: commentThreads.id })
      .from(commentThreads)
      .where(and(eq(commentThreads.targetType, input.targetType), eq(commentThreads.targetId, input.targetId), eq(commentThreads.status, "open")))
      .limit(1);
    const nextThreadId = openThread?.id ?? makeId("cthread");

    if (!openThread) {
      await tx.insert(commentThreads).values({
        id: nextThreadId,
        teamId: target.storageScopeId,
        targetType: input.targetType,
        targetId: input.targetId,
        targetTitle,
        status: "open",
        createdBy: actor.id,
        createdAt,
        updatedAt: createdAt,
      });
    } else {
      await tx.update(commentThreads).set({ targetTitle, updatedAt: createdAt }).where(eq(commentThreads.id, nextThreadId));
    }

    const messageRows = await tx
      .select({ sortOrder: commentMessages.sortOrder })
      .from(commentMessages)
      .where(eq(commentMessages.threadId, nextThreadId));
    const sortOrder = messageRows.reduce((max, message) => Math.max(max, message.sortOrder), -1) + 1;

    await tx.insert(commentMessages).values({
      id: makeId("cmsg"),
      threadId: nextThreadId,
      authorUserId: actor.id,
      author: actor.name,
      body,
      createdAt,
      parentMessageId: null,
      replyToMessageId: null,
      replyToAuthor: null,
      sortOrder,
    });

    return nextThreadId;
  });

  if (!threadId) {
    return { status: "notFound" };
  }

  return { status: "ok", thread: (await getCommentThread(threadId)) ?? undefined };
}

export async function updateCommentThreadStatus(
  threadId: string,
  status: CommentStatus,
  actor: CommentActor,
): Promise<CommentMutationOutcome> {
  const [thread] = await db.select().from(commentThreads).where(eq(commentThreads.id, threadId)).limit(1);
  if (!thread) {
    return { status: "notFound" };
  }

  const target = await resolveCommentTarget(thread.targetType, thread.targetId);
  if (!target) {
    return { status: "notFound" };
  }
  const access = await canMutateObjectiveComment(actor, target.objectiveId);
  if (access !== "allowed") {
    return { status: access === "notFound" ? "notFound" : "forbidden" };
  }

  if (!canManageComment(actor, thread.createdBy)) {
    return { status: "forbidden" };
  }

  await db.update(commentThreads).set({ status, updatedAt: nowIso() }).where(eq(commentThreads.id, threadId));
  return { status: "ok", thread: (await getCommentThread(threadId)) ?? undefined };
}

export async function updateCommentMessage(
  threadId: string,
  messageId: string,
  body: string,
  actor: CommentActor,
): Promise<CommentMutationOutcome> {
  const nextBody = body.trim();
  if (!nextBody) {
    return { status: "invalid" };
  }

  const [thread] = await db.select().from(commentThreads).where(eq(commentThreads.id, threadId)).limit(1);
  if (!thread) {
    return { status: "notFound" };
  }
  const target = await resolveCommentTarget(thread.targetType, thread.targetId);
  if (!target) {
    return { status: "notFound" };
  }
  const access = await canMutateObjectiveComment(actor, target.objectiveId);
  if (access !== "allowed") {
    return { status: access === "notFound" ? "notFound" : "forbidden" };
  }

  const [message] = await db
    .select({ authorUserId: commentMessages.authorUserId })
    .from(commentMessages)
    .where(and(eq(commentMessages.threadId, threadId), eq(commentMessages.id, messageId)))
    .limit(1);
  if (!message) {
    return { status: "notFound" };
  }

  if (!canManageComment(actor, message.authorUserId)) {
    return { status: "forbidden" };
  }

  await db.transaction(async (tx) => {
    const updatedAt = nowIso();
    await tx
      .update(commentMessages)
      .set({ body: nextBody })
      .where(and(eq(commentMessages.threadId, threadId), eq(commentMessages.id, messageId)));
    await tx.update(commentThreads).set({ updatedAt }).where(eq(commentThreads.id, threadId));
  });

  return { status: "ok", thread: (await getCommentThread(threadId)) ?? undefined };
}

export async function deleteCommentMessage(
  threadId: string,
  messageId: string,
  actor: CommentActor,
): Promise<CommentMutationOutcome> {
  const [thread] = await db.select().from(commentThreads).where(eq(commentThreads.id, threadId)).limit(1);
  if (!thread) {
    return { status: "notFound" };
  }
  const target = await resolveCommentTarget(thread.targetType, thread.targetId);
  if (!target) {
    return { status: "notFound" };
  }
  const access = await canMutateObjectiveComment(actor, target.objectiveId);
  if (access !== "allowed") {
    return { status: access === "notFound" ? "notFound" : "forbidden" };
  }

  const [message] = await db
    .select({ authorUserId: commentMessages.authorUserId })
    .from(commentMessages)
    .where(and(eq(commentMessages.threadId, threadId), eq(commentMessages.id, messageId)))
    .limit(1);
  if (!message) {
    return { status: "notFound" };
  }

  if (!canManageComment(actor, message.authorUserId)) {
    return { status: "forbidden" };
  }

  const threadRemoved = await db.transaction(async (tx) => {
    await tx
      .delete(commentMessages)
      .where(
        and(
          eq(commentMessages.threadId, threadId),
          or(eq(commentMessages.id, messageId), eq(commentMessages.parentMessageId, messageId)),
        ),
      );
    await tx
      .update(commentMessages)
      .set({ replyToMessageId: null, replyToAuthor: null })
      .where(and(eq(commentMessages.threadId, threadId), eq(commentMessages.replyToMessageId, messageId)));

    const [remaining] = await tx.select({ id: commentMessages.id }).from(commentMessages).where(eq(commentMessages.threadId, threadId)).limit(1);
    if (!remaining) {
      await tx.delete(commentThreads).where(eq(commentThreads.id, threadId));
      return true;
    }

    await tx.update(commentThreads).set({ updatedAt: nowIso() }).where(eq(commentThreads.id, threadId));
    return false;
  });

  return threadRemoved ? { status: "ok" } : { status: "ok", thread: (await getCommentThread(threadId)) ?? undefined };
}

export interface SubmitObjectiveLootInput {
  body: string;
  resultClaims: LootResultClaim[];
  selfTestReportUrl?: string | null;
  selfTestReportBody?: string | null;
}

export type ObjectiveLootMutationOutcome =
  | { status: "ok"; loot: ObjectiveLoot }
  | { status: "notFound" }
  | { status: "forbidden" }
  | { status: "invalid" }
  | { status: "closed" };

export type ObjectiveContributionReviewMutationOutcome =
  | { status: "ok"; review: ObjectiveContributionReview }
  | { status: "notFound" }
  | { status: "forbidden" }
  | { status: "invalid" }
  | { status: "closed" };

export async function submitObjectiveLoot(
  objectiveId: string,
  input: SubmitObjectiveLootInput,
  actor: Pick<CommentActor, "id" | "name" | "role">,
): Promise<ObjectiveLootMutationOutcome> {
  const body = input.body.trim();
  if (!body) {
    return { status: "invalid" };
  }

  const [objective] = await db.select().from(objectives).where(eq(objectives.id, objectiveId)).limit(1);
  if (!objective) {
    return { status: "notFound" };
  }

  if (objective.flowStatus !== "frozen") {
    return { status: "closed" };
  }

  if (!uniqueMembers(objective.challengers ?? []).includes(actor.name)) {
    return { status: "forbidden" };
  }

  const objectiveResults = await db.select({ id: results.id }).from(results).where(eq(results.objectiveId, objectiveId));
  const resultIds = new Set(objectiveResults.map((result) => result.id));
  const claimsByResult = new Map<string, LootResultClaim>();
  for (const claim of input.resultClaims) {
    if (!resultIds.has(claim.resultId)) continue;
    const evidenceText = claim.evidenceText.trim();
    if (claim.claim !== "notClaimed" && !evidenceText) {
      return { status: "invalid" };
    }

    claimsByResult.set(claim.resultId, {
      resultId: claim.resultId,
      claim: claim.claim,
      evidenceText,
    });
  }

  if (claimsByResult.size !== resultIds.size) {
    return { status: "invalid" };
  }

  const submittedAt = nowIso();
  const lootId = makeId("loot");
  const submitted = await db.transaction(async (tx) => {
    const updated = await tx
      .update(objectives)
      .set({ lootSubmittedAt: submittedAt, flowStatus: "submitted", updatedAt: today(), updatedBy: actor.id })
      .where(and(eq(objectives.id, objectiveId), eq(objectives.flowStatus, "frozen")))
      .returning({ id: objectives.id });
    if (updated.length === 0) {
      return false;
    }

    await tx.insert(objectiveLoot).values({
      id: lootId,
      teamId: objective.teamId,
      objectiveId: objective.id,
      submittedBy: actor.name,
      body,
      resultClaims: Array.from(claimsByResult.values()),
      selfTestReportUrl: input.selfTestReportUrl?.trim() || null,
      selfTestReportBody: input.selfTestReportBody?.trim() || null,
      submittedAt,
    });
    return true;
  });
  if (!submitted) {
    return { status: "closed" };
  }

  const data = await getTaskManagementData({ scope: runtimeScope(objective.teamId) });
  const loot = data.objectiveLoot.find((item) => item.id === lootId);
  return loot ? { status: "ok", loot } : { status: "notFound" };
}

export async function submitObjectiveContributionReview(
  objectiveId: string,
  input: { allocations: ContributionAllocation[] },
  actor: Pick<CommentActor, "id" | "name" | "role">,
): Promise<ObjectiveContributionReviewMutationOutcome> {
  const [objective] = await db.select().from(objectives).where(eq(objectives.id, objectiveId)).limit(1);
  if (!objective) {
    return { status: "notFound" };
  }

  if (objective.flowStatus !== "submitted") {
    return { status: "closed" };
  }

  const challengers = uniqueMembers(objective.challengers ?? []);
  if (!challengers.includes(actor.name)) {
    return { status: "forbidden" };
  }

  const allocations = normalizeContributionAllocations(input.allocations, challengers);
  if (allocations.length !== challengers.length) {
    return { status: "invalid" };
  }

  const reviewId = makeId("contribution-review");
  const submittedAt = nowIso();
  await db.insert(objectiveContributionReviews).values({
    id: reviewId,
    teamId: objective.teamId,
    objectiveId: objective.id,
    reviewer: actor.name,
    allocations,
    submittedAt,
  });

  const data = await getTaskManagementData({ scope: runtimeScope(objective.teamId) });
  const review = data.objectiveContributionReviews.find((item) => item.id === reviewId);
  return review ? { status: "ok", review } : { status: "notFound" };
}

export interface ReviewObjectiveLootInput {
  lootId?: string;
  acceptedResult?: ObjectiveAcceptedResult;
  resultReviews?: Array<{ resultId: string; acceptedResult: ResultAcceptedResult }>;
  contributionResolution?: { ratios: ContributionAllocation[]; reason: string };
  contributionRatios?: Array<{ member: string; ratio: number }>;
  reason?: string;
}

export async function reviewObjectiveLoot(
  objectiveId: string,
  input: ReviewObjectiveLootInput,
  actorId: string,
): Promise<ObjectiveFlowMutationOutcome> {
  const [objective] = await db.select().from(objectives).where(eq(objectives.id, objectiveId)).limit(1);
  if (!objective) return { status: "notFound" };
  if (objective.flowStatus !== "submitted" || !objective.lootSubmittedAt) return { status: "invalid" };

  const lootRows = await db
    .select()
    .from(objectiveLoot)
    .where(eq(objectiveLoot.objectiveId, objectiveId));
  const sortedLootRows = [...lootRows].sort((left, right) => right.submittedAt.localeCompare(left.submittedAt));
  const loot = input.lootId ? sortedLootRows.find((item) => item.id === input.lootId) : sortedLootRows[0];
  if (!loot) return { status: "notFound" };

  const resultRows = await db.select().from(results).where(eq(results.objectiveId, objectiveId));
  const resultIds = new Set(resultRows.map((result) => result.id));
  const claimByResult = new Map(loot.resultClaims.map((claim) => [claim.resultId, claim]));
  const reviewByResult = new Map(
    (input.resultReviews ?? [])
      .filter((review) => resultIds.has(review.resultId))
      .map((review) => [review.resultId, review.acceptedResult]),
  );

  const acceptedResultFor = (resultId: string): ResultAcceptedResult => {
    const reviewed = reviewByResult.get(resultId);
    if (reviewed) return reviewed;
    const claim = claimByResult.get(resultId)?.claim;
    if (claim === "completed" || claim === "falsified") return claim;
    return "failed";
  };

  const acceptedResults = resultRows.map((result) => acceptedResultFor(result.id));
  const objectiveAcceptedResult = input.acceptedResult ?? objectiveAcceptedResultFromReviews(acceptedResults);
  const basePoints = resultRows.reduce((sum, result) => sum + (result.uncertaintyScore ?? uncertaintyScore(result.uncertaintyLevel)), 0);
  const completionMultiplier = completionMultiplierFor(objectiveAcceptedResult, loot.submittedAt, objective.finalDueAt);
  const settlementPoints = Number((basePoints * completionMultiplier).toFixed(2));
  const challengers = uniqueMembers(objective.challengers ?? []);
  const contributionReviews = await db
    .select()
    .from(objectiveContributionReviews)
    .where(eq(objectiveContributionReviews.objectiveId, objectiveId));
  const contributionSummary = summarizeContributionReviews(
    challengers,
    contributionReviews.map((item) => ({
      id: item.id,
      objectiveId: item.objectiveId,
      reviewer: item.reviewer,
      allocations: item.allocations,
      submittedAt: item.submittedAt,
    })),
  );
  const resolutionRatios = input.contributionResolution?.ratios ?? input.contributionRatios ?? [];
  const normalizedRatios =
    contributionSummary.status === "ready"
      ? contributionSummary.ratios
      : normalizeContributionRatios(resolutionRatios, challengers);
  if (!normalizedRatios || normalizedRatios.length === 0) return { status: "invalid" };
  const memberRows =
    normalizedRatios.length > 0
      ? await db
          .select({ id: users.id, name: users.name })
          .from(teamMembers)
          .innerJoin(users, eq(teamMembers.userId, users.id))
          .where(
            and(
              eq(teamMembers.teamId, objective.teamId),
              inArray(
                users.name,
                normalizedRatios.map((item) => item.member),
              ),
            ),
          )
      : [];
  const userIdByName = new Map(memberRows.map((user) => [user.name, user.id]));
  const createdAt = nowIso();
  const reason = input.reason?.trim() || input.contributionResolution?.reason.trim() || `目标结算：${objective.title}`;

  const settled = await db.transaction(async (tx) => {
    const updated = await tx
      .update(objectives)
      .set({
        flowStatus: "settled",
        stage: "goalFrozen",
        acceptedResult: objectiveAcceptedResult,
        completionMultiplier,
        objectiveBasePoints: basePoints,
        objectiveSettlementPoints: settlementPoints,
        assignedChallengers: [],
        updatedAt: today(),
        updatedBy: actorId,
      })
      .where(and(eq(objectives.id, objectiveId), eq(objectives.flowStatus, "submitted")))
      .returning({ id: objectives.id });
    if (updated.length === 0) {
      return false;
    }

    for (const result of resultRows) {
      await tx
        .update(results)
        .set({ acceptedResult: acceptedResultFor(result.id), updatedBy: actorId })
        .where(eq(results.id, result.id));
    }
    await tx.delete(pointLedger).where(eq(pointLedger.objectiveId, objectiveId));
    if (normalizedRatios.length > 0) {
      await tx.insert(pointLedger).values(
        normalizedRatios.map((item) => ({
          id: makeId("points"),
          teamId: objective.teamId,
          objectiveId: objective.id,
          userId: userIdByName.get(item.member) ?? null,
          memberName: item.member,
          points: Number((settlementPoints * item.ratio).toFixed(2)),
          reason,
          createdAt,
        })),
      );
    }
    return true;
  });
  if (!settled) return { status: "invalid" };

  return objectiveOutcome(objectiveId, runtimeScope(objective.teamId));
}

export async function createTask(input: CreateTaskInput): Promise<Task | null> {
  const title = input.title.trim();
  if (!title) {
    return null;
  }

  const dueDate = input.dueDate?.trim();
  if (dueDate && !isDateOnlyString(dueDate)) {
    return null;
  }

  const created = await db.transaction(async (tx) => {
    const [result] = await tx.select().from(results).where(eq(results.id, input.linkedResultId)).limit(1).for("update");
    if (!result) {
      return null;
    }

    const feedbackOriginId = input.feedbackOriginId?.trim() || null;
    if (feedbackOriginId) {
      const [originFeedback] = await tx
        .select({ id: feedback.id, teamId: feedback.teamId, linkedResultId: feedback.linkedResultId })
        .from(feedback)
        .where(eq(feedback.id, feedbackOriginId))
        .limit(1);
      if (!originFeedback || originFeedback.teamId !== result.teamId || originFeedback.linkedResultId !== result.id) {
        return null;
      }
    }

    const siblingRows = await tx.select({ sortOrder: tasks.sortOrder }).from(tasks).where(eq(tasks.linkedResultId, result.id));
    const sortOrder = siblingRows.reduce((max, row) => Math.max(max, row.sortOrder), -1) + 1;
    const id = makeId("ORF");
    const now = today();

    await tx.insert(tasks).values({
      id,
      teamId: result.teamId,
      title,
      description: input.description?.trim() || "执行支撑关联指标的下一步动作。",
      status: "Todo",
      priority: input.priority ?? "Medium",
      assignee: input.assignee?.trim() || "User",
      linkedObjectiveId: result.objectiveId,
      linkedResultId: result.id,
      feedbackOriginId,
      dueDate: dueDate ?? now,
      tags: ["ORF"],
      createdAt: now,
      updatedAt: now,
      sortOrder,
    });

    return { id, scope: runtimeScope(result.teamId) };
  });

  if (!created) {
    return null;
  }

  const data = await getTaskManagementData({ scope: created.scope });
  return data.tasks.find((task) => task.id === created.id) ?? null;
}

export async function createChecklistItem(taskId: string, input: CreateChecklistItemInput): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [task] = await tx.select().from(tasks).where(eq(tasks.id, taskId)).limit(1).for("update");
    if (!task) {
      return false;
    }

    const rows = await tx
      .select({ id: taskChecklistItems.id })
      .from(taskChecklistItems)
      .where(eq(taskChecklistItems.taskId, taskId))
      .orderBy(taskChecklistItems.sortOrder);
    const id = makeId("ck");
    const afterIndex = input.afterItemId ? rows.findIndex((row) => row.id === input.afterItemId) : -1;
    const insertIndex = afterIndex >= 0 ? afterIndex + 1 : rows.length;
    const orderedIds = [...rows.map((row) => row.id)];
    orderedIds.splice(insertIndex, 0, id);

    await tx.insert(taskChecklistItems).values({
      id,
      taskId,
      label: input.label?.trim() || "新子任务",
      done: false,
      sortOrder: insertIndex,
      updatedAt: today(),
    });

    for (const [index, itemId] of orderedIds.entries()) {
      await tx.update(taskChecklistItems).set({ sortOrder: index }).where(and(eq(taskChecklistItems.taskId, taskId), eq(taskChecklistItems.id, itemId)));
    }
    await tx.update(tasks).set({ status: task.status === "Done" ? "In Progress" : task.status, updatedAt: today() }).where(eq(tasks.id, taskId));

    return true;
  });
}

export async function updateObjectiveTitle(objectiveId: string, title: string): Promise<boolean> {
  const nextTitle = title.trim();
  if (!nextTitle) {
    return false;
  }

  return db.transaction(async (tx) => {
    const updated = await tx
      .update(objectives)
      .set({ title: nextTitle, updatedAt: today() })
      .where(eq(objectives.id, objectiveId))
      .returning({ id: objectives.id });
    if (updated.length === 0) {
      return false;
    }

    await tx
      .update(commentThreads)
      .set({ targetTitle: nextTitle, updatedAt: nowIso() })
      .where(and(eq(commentThreads.targetType, "objective"), eq(commentThreads.targetId, objectiveId)));
    return true;
  });
}

export async function updateObjectiveStage(objectiveId: string, stage: OrfStage): Promise<boolean> {
  const [objective] = await db
    .select({ flowStatus: objectives.flowStatus })
    .from(objectives)
    .where(eq(objectives.id, objectiveId))
    .limit(1);
  if (!objective || !isStageCompatibleWithFlowStatus(objective.flowStatus, stage)) {
    return false;
  }

  const updated = await db.update(objectives).set({ stage, updatedAt: today() }).where(eq(objectives.id, objectiveId)).returning({ id: objectives.id });
  return updated.length > 0;
}

function isStageCompatibleWithFlowStatus(flowStatus: Objective["flowStatus"], stage: OrfStage) {
  if (flowStatus === "reestimating") {
    return stage === "orfReestimate";
  }

  if (flowStatus === "frozen" || flowStatus === "submitted" || flowStatus === "settled" || flowStatus === "closed") {
    return stage === "goalFrozen";
  }

  return stage !== "goalFrozen";
}

export async function updateResultTitle(resultId: string, title: string): Promise<boolean> {
  const nextTitle = title.trim();
  if (!nextTitle) {
    return false;
  }

  return db.transaction(async (tx) => {
    const [target] = await tx
      .select({ flowStatus: objectives.flowStatus })
      .from(results)
      .innerJoin(objectives, eq(objectives.id, results.objectiveId))
      .where(eq(results.id, resultId))
      .limit(1)
      .for("update");
    if (!target || !resultMutationFlowStatuses.has(target.flowStatus)) {
      return false;
    }

    const updated = await tx.update(results).set({ title: nextTitle }).where(eq(results.id, resultId)).returning({ id: results.id });
    if (updated.length === 0) {
      return false;
    }

    await tx
      .update(commentThreads)
      .set({ targetTitle: nextTitle, updatedAt: nowIso() })
      .where(and(eq(commentThreads.targetType, "result"), eq(commentThreads.targetId, resultId)));
    return true;
  });
}

export async function updateTaskTitle(taskId: string, title: string): Promise<boolean> {
  const nextTitle = title.trim();
  if (!nextTitle) {
    return false;
  }

  return db.transaction(async (tx) => {
    const updated = await tx.update(tasks).set({ title: nextTitle, updatedAt: today() }).where(eq(tasks.id, taskId)).returning({ id: tasks.id });
    if (updated.length === 0) {
      return false;
    }

    await tx
      .update(commentThreads)
      .set({ targetTitle: nextTitle, updatedAt: nowIso() })
      .where(and(eq(commentThreads.targetType, "task"), eq(commentThreads.targetId, taskId)));
    return true;
  });
}

export async function updateChecklistItemLabel(taskId: string, itemId: string, label: string): Promise<boolean> {
  const nextLabel = label.trim();
  if (!nextLabel) {
    return false;
  }

  return db.transaction(async (tx) => {
    const updated = await tx
      .update(taskChecklistItems)
      .set({ label: nextLabel, updatedAt: today() })
      .where(and(eq(taskChecklistItems.taskId, taskId), eq(taskChecklistItems.id, itemId)))
      .returning({ id: taskChecklistItems.id });

    if (updated.length === 0) {
      return false;
    }

    await tx.update(tasks).set({ updatedAt: today() }).where(eq(tasks.id, taskId));
    await tx
      .update(commentThreads)
      .set({ targetTitle: nextLabel, updatedAt: nowIso() })
      .where(and(eq(commentThreads.targetType, "subtask"), eq(commentThreads.targetId, itemId)));
    return true;
  });
}

export async function deleteObjective(objectiveId: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [objective] = await tx.select({ flowStatus: objectives.flowStatus, id: objectives.id }).from(objectives).where(eq(objectives.id, objectiveId)).limit(1);
    if (!objective) {
      return false;
    }
    if (objectiveDeleteLockedFlowStatuses.has(objective.flowStatus)) {
      return false;
    }

    const resultRows = await tx.select({ id: results.id }).from(results).where(eq(results.objectiveId, objectiveId));
    const taskRows = await tx.select({ id: tasks.id }).from(tasks).where(eq(tasks.linkedObjectiveId, objectiveId));
    const resultIds = resultRows.map((result) => result.id);
    const taskIds = taskRows.map((task) => task.id);
    const checklistRows =
      taskIds.length > 0
        ? await tx.select({ id: taskChecklistItems.id }).from(taskChecklistItems).where(inArray(taskChecklistItems.taskId, taskIds))
        : [];
    const checklistIds = checklistRows.map((item) => item.id);

    if (checklistIds.length > 0) {
      await tx.delete(commentThreads).where(and(eq(commentThreads.targetType, "subtask"), inArray(commentThreads.targetId, checklistIds)));
    }
    if (taskIds.length > 0) {
      await tx.delete(commentThreads).where(and(eq(commentThreads.targetType, "task"), inArray(commentThreads.targetId, taskIds)));
    }
    if (resultIds.length > 0) {
      await tx.delete(commentThreads).where(and(eq(commentThreads.targetType, "result"), inArray(commentThreads.targetId, resultIds)));
    }
    await tx.delete(commentThreads).where(and(eq(commentThreads.targetType, "objective"), eq(commentThreads.targetId, objectiveId)));

    const deleted = await tx.delete(objectives).where(eq(objectives.id, objectiveId)).returning({ id: objectives.id });
    return deleted.length > 0;
  });
}

export async function deleteResult(resultId: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [result] = await tx
      .select({ flowStatus: objectives.flowStatus, id: results.id })
      .from(results)
      .innerJoin(objectives, eq(objectives.id, results.objectiveId))
      .where(eq(results.id, resultId))
      .limit(1)
      .for("update");
    if (!result) {
      return false;
    }
    if (!resultMutationFlowStatuses.has(result.flowStatus)) {
      return false;
    }

    const taskRows = await tx.select({ id: tasks.id }).from(tasks).where(eq(tasks.linkedResultId, resultId));
    const taskIds = taskRows.map((task) => task.id);
    const checklistRows =
      taskIds.length > 0
        ? await tx.select({ id: taskChecklistItems.id }).from(taskChecklistItems).where(inArray(taskChecklistItems.taskId, taskIds))
        : [];
    const checklistIds = checklistRows.map((item) => item.id);

    if (checklistIds.length > 0) {
      await tx.delete(commentThreads).where(and(eq(commentThreads.targetType, "subtask"), inArray(commentThreads.targetId, checklistIds)));
    }
    if (taskIds.length > 0) {
      await tx.delete(commentThreads).where(and(eq(commentThreads.targetType, "task"), inArray(commentThreads.targetId, taskIds)));
    }
    await tx.delete(commentThreads).where(and(eq(commentThreads.targetType, "result"), eq(commentThreads.targetId, resultId)));

    const deleted = await tx.delete(results).where(eq(results.id, resultId)).returning({ id: results.id });
    return deleted.length > 0;
  });
}

export async function deleteTask(taskId: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [task] = await tx.select({ id: tasks.id }).from(tasks).where(eq(tasks.id, taskId)).limit(1);
    if (!task) {
      return false;
    }

    const checklistRows = await tx.select({ id: taskChecklistItems.id }).from(taskChecklistItems).where(eq(taskChecklistItems.taskId, taskId));
    const checklistIds = checklistRows.map((item) => item.id);

    if (checklistIds.length > 0) {
      await tx.delete(commentThreads).where(and(eq(commentThreads.targetType, "subtask"), inArray(commentThreads.targetId, checklistIds)));
    }
    await tx.delete(commentThreads).where(and(eq(commentThreads.targetType, "task"), eq(commentThreads.targetId, taskId)));

    const deleted = await tx.delete(tasks).where(eq(tasks.id, taskId)).returning({ id: tasks.id });
    return deleted.length > 0;
  });
}

export async function deleteChecklistItem(taskId: string, itemId: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [task] = await tx.select().from(tasks).where(eq(tasks.id, taskId)).limit(1).for("update");
    if (!task) {
      return false;
    }

    const deleted = await tx
      .delete(taskChecklistItems)
      .where(and(eq(taskChecklistItems.taskId, taskId), eq(taskChecklistItems.id, itemId)))
      .returning({ id: taskChecklistItems.id });
    if (deleted.length === 0) {
      return false;
    }

    await tx.delete(commentThreads).where(and(eq(commentThreads.targetType, "subtask"), eq(commentThreads.targetId, itemId)));
    const rows = await tx
      .select({ id: taskChecklistItems.id, done: taskChecklistItems.done })
      .from(taskChecklistItems)
      .where(eq(taskChecklistItems.taskId, taskId))
      .orderBy(taskChecklistItems.sortOrder);
    for (const [index, row] of rows.entries()) {
      await tx.update(taskChecklistItems).set({ sortOrder: index }).where(eq(taskChecklistItems.id, row.id));
    }
    await tx.update(tasks).set({ status: statusFromChecklist(rows, task.status), updatedAt: today() }).where(eq(tasks.id, taskId));
    return true;
  });
}

export async function moveResult(resultId: string, referenceResultId: string, placement: "before" | "after"): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [moving] = await tx.select().from(results).where(eq(results.id, resultId)).limit(1);
    const [reference] = await tx.select().from(results).where(eq(results.id, referenceResultId)).limit(1);
    if (!moving || !reference || moving.objectiveId !== reference.objectiveId || moving.id === reference.id) {
      return false;
    }
    const [objective] = await tx
      .select({ flowStatus: objectives.flowStatus, id: objectives.id })
      .from(objectives)
      .where(eq(objectives.id, moving.objectiveId))
      .limit(1)
      .for("update");
    if (!objective) {
      return false;
    }
    if (!resultMutationFlowStatuses.has(objective.flowStatus)) {
      return false;
    }

    const rows = await tx
      .select({ id: results.id })
      .from(results)
      .where(eq(results.objectiveId, moving.objectiveId))
      .orderBy(results.sortOrder);
    const orderedIds = reorderIds(rows.map((row) => row.id), resultId, referenceResultId, placement);
    for (const [index, id] of orderedIds.entries()) {
      await tx.update(results).set({ sortOrder: index }).where(eq(results.id, id));
    }
    await tx.update(objectives).set({ updatedAt: today() }).where(eq(objectives.id, moving.objectiveId));
    return true;
  });
}

export async function moveTask(taskId: string, input: { toResultId: string; referenceTaskId?: string; placement?: "before" | "after" }): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [task] = await tx.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
    const [targetResult] = await tx.select().from(results).where(eq(results.id, input.toResultId)).limit(1);
    if (!task || !targetResult) {
      return false;
    }
    const affectedResultIds = Array.from(new Set([task.linkedResultId, targetResult.id])).sort();
    const lockedResults = await tx
      .select({ id: results.id })
      .from(results)
      .where(inArray(results.id, affectedResultIds))
      .for("update");
    if (lockedResults.length !== affectedResultIds.length) {
      return false;
    }
    if (input.referenceTaskId) {
      const [referenceTask] = await tx.select().from(tasks).where(eq(tasks.id, input.referenceTaskId)).limit(1);
      if (!referenceTask || referenceTask.linkedResultId !== targetResult.id || referenceTask.id === task.id) {
        return false;
      }
    }

    await tx
      .update(tasks)
      .set({ linkedResultId: targetResult.id, linkedObjectiveId: targetResult.objectiveId, updatedAt: today() })
      .where(eq(tasks.id, taskId));

    for (const resultId of affectedResultIds) {
      const rows = await tx
        .select({ id: tasks.id })
        .from(tasks)
        .where(eq(tasks.linkedResultId, resultId))
        .orderBy(tasks.sortOrder);
      const ids = rows.map((row) => row.id);
      const orderedIds =
        resultId === targetResult.id && input.referenceTaskId
          ? reorderIds(ids, taskId, input.referenceTaskId, input.placement ?? "after")
          : resultId === targetResult.id
            ? ids.filter((id) => id !== taskId).concat(taskId)
            : ids.filter((id) => id !== taskId);

      for (const [index, id] of orderedIds.entries()) {
        await tx.update(tasks).set({ sortOrder: index }).where(eq(tasks.id, id));
      }
    }

    return true;
  });
}

export async function moveChecklistItem(
  taskId: string,
  itemId: string,
  input: { toTaskId: string; referenceItemId?: string; placement?: "before" | "after" },
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [item] = await tx
      .select()
      .from(taskChecklistItems)
      .where(and(eq(taskChecklistItems.taskId, taskId), eq(taskChecklistItems.id, itemId)))
      .limit(1);
    const [targetTask] = await tx.select().from(tasks).where(eq(tasks.id, input.toTaskId)).limit(1);
    const [sourceTask] = await tx.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
    if (!item || !targetTask || !sourceTask) {
      return false;
    }
    const affectedTaskIds = Array.from(new Set([taskId, input.toTaskId])).sort();
    const lockedTasks = await tx
      .select({ id: tasks.id })
      .from(tasks)
      .where(inArray(tasks.id, affectedTaskIds))
      .for("update");
    if (lockedTasks.length !== affectedTaskIds.length) {
      return false;
    }
    if (input.referenceItemId) {
      const [referenceItem] = await tx.select().from(taskChecklistItems).where(eq(taskChecklistItems.id, input.referenceItemId)).limit(1);
      if (!referenceItem || referenceItem.taskId !== input.toTaskId || referenceItem.id === itemId) {
        return false;
      }
    }

    await tx.update(taskChecklistItems).set({ taskId: input.toTaskId, updatedAt: today() }).where(eq(taskChecklistItems.id, itemId));

    for (const currentTaskId of affectedTaskIds) {
      const rows = await tx
        .select({ id: taskChecklistItems.id, done: taskChecklistItems.done })
        .from(taskChecklistItems)
        .where(eq(taskChecklistItems.taskId, currentTaskId))
        .orderBy(taskChecklistItems.sortOrder);
      const ids = rows.map((row) => row.id);
      const orderedIds =
        currentTaskId === input.toTaskId && input.referenceItemId
          ? reorderIds(ids, itemId, input.referenceItemId, input.placement ?? "after")
          : currentTaskId === input.toTaskId
            ? ids.filter((id) => id !== itemId).concat(itemId)
          : ids;

      for (const [index, id] of orderedIds.entries()) {
        await tx.update(taskChecklistItems).set({ sortOrder: index }).where(eq(taskChecklistItems.id, id));
      }
      const fallback = currentTaskId === sourceTask.id ? sourceTask.status : targetTask.status;
      await tx.update(tasks).set({ status: statusFromChecklist(rows, fallback), updatedAt: today() }).where(eq(tasks.id, currentTaskId));
    }

    return true;
  });
}

export async function updateTaskStatus(taskId: string, status: TaskStatus): Promise<boolean> {
  const updated = await db.update(tasks).set({ status, updatedAt: today() }).where(eq(tasks.id, taskId)).returning({ id: tasks.id });
  return updated.length > 0;
}

export async function setTaskCompletion(taskId: string, done: boolean): Promise<boolean> {
  const status: TaskStatus = done ? "Done" : "Todo";
  return db.transaction(async (tx) => {
    const updated = await tx.update(tasks).set({ status, updatedAt: today() }).where(eq(tasks.id, taskId)).returning({ id: tasks.id });
    if (updated.length === 0) {
      return false;
    }

    await tx.update(taskChecklistItems).set({ done, updatedAt: today() }).where(eq(taskChecklistItems.taskId, taskId));
    return true;
  });
}

export async function updateChecklistItem(taskId: string, itemId: string, done: boolean): Promise<boolean> {
  return db.transaction(async (tx) => {
    const updated = await tx
      .update(taskChecklistItems)
      .set({ done, updatedAt: today() })
      .where(and(eq(taskChecklistItems.taskId, taskId), eq(taskChecklistItems.id, itemId)))
      .returning({ id: taskChecklistItems.id });

    if (updated.length === 0) {
      return false;
    }

    const checklist = await tx.select({ done: taskChecklistItems.done }).from(taskChecklistItems).where(eq(taskChecklistItems.taskId, taskId));
    const completedCount = checklist.filter((item) => item.done).length;
    const status: TaskStatus = completedCount === checklist.length ? "Done" : completedCount > 0 ? "In Progress" : "Todo";

    await tx.update(tasks).set({ status, updatedAt: today() }).where(eq(tasks.id, taskId));
    return true;
  });
}
