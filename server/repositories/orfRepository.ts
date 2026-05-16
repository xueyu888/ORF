import { and, eq, inArray, or } from "drizzle-orm";
import { initialOrfState } from "../../src/data/initialOrfState";
import type {
  BountySource,
  ChallengeApplication,
  CommentStatus,
  CommentTargetType,
  CommentThread,
  Evidence,
  Feedback,
  FeedbackStatus,
  MetricDirection,
  Objective,
  OrfStage,
  OrfState,
  Priority,
  Result,
  Task,
  TaskStatus,
  UncertaintyLevel,
} from "../../src/types/orf";
import { db } from "../db/client";
import {
  commentMessages,
  commentThreads,
  evidence,
  feedback,
  feedbackCauseCategories,
  objectives,
  results,
  resultTrendPoints,
  taskChecklistItems,
  tasks,
  teams,
} from "../db/schema";
import { getPermissionRulesForTeam } from "./permissionRepository";
import { getTeamUsers } from "./userRepository";

export type TaskManagementData = Pick<
  OrfState,
  "objectives" | "results" | "tasks" | "evidence" | "feedback" | "comments" | "permissionRules"
>;

type CommentActor = {
  canManageAllComments?: boolean;
  id: string;
  name: string;
  role: "admin" | "member";
};

type CommentMutationOutcome =
  | { status: "ok"; thread?: CommentThread }
  | { status: "notFound" }
  | { status: "forbidden" }
  | { status: "invalid" };
type CommentThreadRow = typeof commentThreads.$inferSelect;
type CommentMessageRow = typeof commentMessages.$inferSelect;

const today = () => new Date().toISOString().slice(0, 10);
const nowIso = () => new Date().toISOString();
const makeId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
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

function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function isMissingCommentStorageError(error: unknown) {
  const cause = error && typeof error === "object" && "cause" in error ? (error as { cause?: unknown }).cause : error;
  if (!cause || typeof cause !== "object" || !("code" in cause)) {
    return false;
  }

  return cause.code === "42P01" || cause.code === "42704";
}

async function getCommentRows(): Promise<[CommentThreadRow[], CommentMessageRow[]]> {
  try {
    return await Promise.all([db.select().from(commentThreads), db.select().from(commentMessages)]);
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

function uncertaintyScore(level: UncertaintyLevel | null) {
  return level ? uncertaintyScores[level] : uncertaintyScores["进阶"];
}

export async function getTaskManagementData(): Promise<TaskManagementData> {
  const [
    objectiveRows,
    resultRows,
    trendRows,
    taskRows,
    checklistRows,
    evidenceRows,
    feedbackRows,
    causeRows,
    teamRows,
  ] = await Promise.all([
    db.select().from(objectives),
    db.select().from(results),
    db.select().from(resultTrendPoints),
    db.select().from(tasks),
    db.select().from(taskChecklistItems),
    db.select().from(evidence),
    db.select().from(feedback),
    db.select().from(feedbackCauseCategories),
    db.select({ id: teams.id }).from(teams),
  ]);
  const [commentThreadRows, commentMessageRows] = await getCommentRows();
  const permissionRules = teamRows[0] ? await getPermissionRulesForTeam(teamRows[0].id) : initialOrfState.permissionRules;

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
    const acceptedResults = objectiveResults.filter((result) => result.acceptedResult === "completed" || result.acceptedResult === "falsified");

    return {
      id: objective.id,
      title: objective.title,
      description: objective.description,
      whyItMatters: objective.whyItMatters,
      cycle: objective.cycle,
      stage: objective.stage,
      status: objective.status,
      confidence: objective.confidence,
      progress: Math.max(0, Math.min(100, Math.round(objective.progress))),
      boundary: objective.boundary,
      successDefinition: objective.successDefinition,
      resultIds: objectiveResults.map((result) => result.id),
      feedbackIds: feedbackItems.filter((item) => item.linkedObjectiveId === objective.id).map((item) => item.id),
      taskIds: taskItems.filter((task) => task.linkedObjectiveId === objective.id).map((task) => task.id),
      finalDueAt: objective.finalDueAt || addDays(objective.updatedAt, 14),
      challengers: objective.challengers,
      assignedChallengers: objective.assignedChallengers,
      challengeApplications: objective.challengeApplications,
      acceptedAt: objective.acceptedAt,
      confirmationDueAt: objective.confirmationDueAt,
      confirmedAt: objective.confirmedAt,
      lootSubmittedAt: objective.lootSubmittedAt,
      acceptedResult: objective.acceptedResult,
      completionMultiplier: objective.completionMultiplier,
      objectiveBasePoints: objective.objectiveBasePoints || acceptedResults.reduce((sum, result) => sum + result.uncertaintyScore, 0),
      objectiveSettlementPoints: objective.objectiveSettlementPoints,
      createdAt: objective.createdAt,
      updatedAt: objective.updatedAt,
    };
  });
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
    permissionRules,
  };
}

export async function getOrfStateSnapshot(): Promise<OrfState> {
  const data = await getTaskManagementData();
  const [team] = await db.select({ id: teams.id }).from(teams).limit(1);
  const teamUsers = team ? await getTeamUsers(team.id) : initialOrfState.users;

  return {
    ...data,
    users: teamUsers,
    currentUserId: teamUsers[0]?.id ?? initialOrfState.currentUserId,
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
  result: Result;
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

function compareBountyItems(left: BountyHallItem, right: BountyHallItem) {
  const leftDeadline = left.deadline || "9999-12-31";
  const rightDeadline = right.deadline || "9999-12-31";
  return leftDeadline.localeCompare(rightDeadline) || right.uncertaintyPoints - left.uncertaintyPoints || left.result.title.localeCompare(right.result.title);
}

function objectiveClosedForBountyHall(objective: Objective) {
  return Boolean(objective.lootSubmittedAt || objective.acceptedResult || objective.objectiveSettlementPoints != null);
}

function objectiveAcceptedForBountyHall(objective: Objective) {
  return objective.challengers.length > 0;
}

function contributionSummaryFor(data: TaskManagementData, member: string) {
  return {
    points: data.objectives.reduce((sum, objective) => {
      if (!objective.challengers.includes(member)) return sum;
      return sum + (objective.objectiveSettlementPoints ?? 0);
    }, 0),
  };
}

export async function getBountyHallData(member: string): Promise<BountyHallData> {
  const data = await getTaskManagementData();
  const items = data.objectives.flatMap((objective) => {
    const objectiveResults = data.results.filter((result) => result.objectiveId === objective.id);
    const result = objectiveResults[0];
    if (!result) return [];
    if (objectiveAcceptedForBountyHall(objective) || objectiveClosedForBountyHall(objective)) return [];

    const pendingApplications = (objective.challengeApplications ?? []).filter((application) => application.status === "pending");
    return [{
      uncertaintyPoints: objectiveResults.reduce((sum, item) => sum + item.uncertaintyScore, 0),
      deadline: objective.finalDueAt,
      definer: result.definer ?? "",
      difficultyRank: Math.max(...objectiveResults.map(resultDifficultyRank)),
      hasCurrentApplication: pendingApplications.some((application) => application.applicant === member),
      isRecruitment: objective.assignedChallengers.includes(member),
      objective,
      result,
      results: objectiveResults,
      source: result.source ?? "managerDefined",
    }];
  }).sort(compareBountyItems);

  const availableItems = items.filter((item) => !item.isRecruitment && !item.hasCurrentApplication);
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

export async function getMyChallengesData(member: string, includeAll = false): Promise<TaskManagementData> {
  const data = await getTaskManagementData();
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

export async function createObjective(input: CreateObjectiveInput, context: { teamId: string; userId: string }): Promise<Objective | null> {
  const id = makeId("obj");
  const now = today();

  await db.insert(objectives).values({
    id,
    teamId: context.teamId,
    title: input.title,
    description: input.whyItMatters,
    whyItMatters: input.whyItMatters,
    cycle: input.cycle,
    stage: "orfReestimate",
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

  const data = await getTaskManagementData();
  return data.objectives.find((objective) => objective.id === id) ?? null;
}

export interface CreateChecklistItemInput {
  label?: string;
  afterItemId?: string;
}

export async function createResult(input: CreateResultInput): Promise<Result | null> {
  const [objective] = await db.select().from(objectives).where(eq(objectives.id, input.objectiveId)).limit(1);
  if (!objective) {
    return null;
  }

  const siblingRows = await db.select({ sortOrder: results.sortOrder }).from(results).where(eq(results.objectiveId, input.objectiveId));
  const sortOrder = siblingRows.reduce((max, row) => Math.max(max, row.sortOrder), -1) + 1;
  const id = makeId("res");

  await db.insert(results).values({
    id,
    teamId: objective.teamId,
    objectiveId: objective.id,
    title: input.title,
    description: input.description ?? "由 ORF Flow 规划创建的指标。",
    metricName: input.metricName,
    metricRequirement: `${input.metricName}：写清统计对象和完成标准后进入执行。`,
    statisticalObject: null,
    completionStandard: null,
    sampleSet: null,
    measurementScope: null,
    uncertaintyLevel: input.uncertaintyLevel ?? null,
    baseline: input.baseline ?? 0,
    current: input.current ?? 0,
    target: input.target ?? 100,
    unit: input.unit ?? "%",
    direction: input.direction ?? "increase",
    status: "Draft",
    confidence: 50,
    source: input.source ?? "managerDefined",
    definer: input.definer ?? "",
    uncertaintyScore: uncertaintyScore(input.uncertaintyLevel ?? null),
    acceptedResult: "unreviewed",
    reviewCadence: "Weekly",
    sortOrder,
  });

  const data = await getTaskManagementData();
  return data.results.find((result) => result.id === id) ?? null;
}

export type AcceptObjectiveChallengeOutcome =
  | { status: "accepted"; objective: Objective }
  | { status: "alreadyAccepted"; challengers: string[] }
  | { status: "invalidDueDate" }
  | { status: "notFound" };

export async function acceptObjectiveChallenge(objectiveId: string, challenger: string): Promise<AcceptObjectiveChallengeOutcome> {
  const nextChallenger = challenger.trim();
  if (!nextChallenger) {
    return { status: "notFound" };
  }

  const [objective] = await db.select().from(objectives).where(eq(objectives.id, objectiveId)).limit(1);
  if (!objective) {
    return { status: "notFound" };
  }

  const currentChallengers = uniqueMembers(objective.challengers ?? []);
  if (currentChallengers.includes(nextChallenger)) {
    return { status: "alreadyAccepted", challengers: currentChallengers };
  }

  const acceptedAt = nowIso();
  const nextConfirmationDueAt = confirmationDueAt(objective.finalDueAt, acceptedAt);
  if (!nextConfirmationDueAt) {
    return { status: "invalidDueDate" };
  }

  await db
    .update(objectives)
    .set({
      challengers: [...currentChallengers, nextChallenger],
      assignedChallengers: uniqueMembers(objective.assignedChallengers ?? []).filter((member) => member !== nextChallenger),
      acceptedAt: objective.acceptedAt ?? acceptedAt,
      confirmationDueAt: objective.confirmationDueAt ?? nextConfirmationDueAt,
      challengeApplications: (objective.challengeApplications ?? []).map((application) =>
        application.applicant === nextChallenger && application.status === "pending" ? { ...application, status: "approved", decidedAt: acceptedAt } : application,
      ),
      status: objective.status === "Draft" ? "On Track" : objective.status,
      updatedAt: today(),
      updatedBy: objective.updatedBy,
    })
    .where(eq(objectives.id, objectiveId));

  const data = await getTaskManagementData();
  const accepted = data.objectives.find((item) => item.id === objectiveId);
  return accepted ? { status: "accepted", objective: accepted } : { status: "notFound" };
}

export type ApplyObjectiveChallengeOutcome =
  | { status: "applied"; objective: Objective }
  | { status: "alreadyApplied" }
  | { status: "alreadyAccepted"; challengers: string[] }
  | { status: "notFound" };

export async function applyForObjectiveChallenge(objectiveId: string, applicant: string): Promise<ApplyObjectiveChallengeOutcome> {
  const nextApplicant = applicant.trim();
  if (!nextApplicant) {
    return { status: "notFound" };
  }

  const [objective] = await db.select().from(objectives).where(eq(objectives.id, objectiveId)).limit(1);
  if (!objective) {
    return { status: "notFound" };
  }

  const challengers = uniqueMembers(objective.challengers ?? []);
  if (challengers.includes(nextApplicant)) {
    return { status: "alreadyAccepted", challengers };
  }

  const applications = objective.challengeApplications ?? [];
  if (applications.some((application) => application.applicant === nextApplicant && application.status === "pending")) {
    return { status: "alreadyApplied" };
  }

  const application: ChallengeApplication = {
    id: makeId("challenge-application"),
    applicant: nextApplicant,
    status: "pending",
    createdAt: nowIso(),
    decidedAt: null,
  };

  await db
    .update(objectives)
    .set({
      challengeApplications: [application, ...applications],
      updatedAt: today(),
    })
    .where(eq(objectives.id, objectiveId));

  const data = await getTaskManagementData();
  const applied = data.objectives.find((item) => item.id === objectiveId);
  return applied ? { status: "applied", objective: applied } : { status: "notFound" };
}

export type CreateFeedbackInput = Pick<
  Feedback,
  "phenomenon" | "causeCategories" | "impact" | "linkedResultId" | "suggestedAdjustment" | "source" | "owner"
>;

export async function createFeedback(input: CreateFeedbackInput, actorId: string): Promise<Feedback | null> {
  const [result] = await db.select().from(results).where(eq(results.id, input.linkedResultId)).limit(1);
  if (!result) {
    return null;
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
      owner: input.owner,
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

  const data = await getTaskManagementData();
  return data.feedback.find((item) => item.id === id) ?? null;
}

export async function updateFeedbackStatus(feedbackId: string, status: FeedbackStatus, actorId: string): Promise<boolean> {
  const updated = await db
    .update(feedback)
    .set({ status, updatedAt: today(), updatedBy: actorId })
    .where(eq(feedback.id, feedbackId))
    .returning({ id: feedback.id });
  return updated.length > 0;
}

export async function updateResultConfidence(resultId: string, confidence: number, actorId: string): Promise<boolean> {
  const updated = await db
    .update(results)
    .set({ confidence, updatedBy: actorId })
    .where(eq(results.id, resultId))
    .returning({ id: results.id });
  return updated.length > 0;
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
    const [result] = await tx.select().from(results).where(eq(results.id, input.resultId)).limit(1);
    if (!result) {
      return false;
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
      teamId: result.teamId,
      targetType: "result",
      targetId: result.id,
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
      body: `悬赏指标更新：${nextTitle}\n原因：${reason}`,
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
  teamId: string;
  title: string;
};

async function resolveCommentTarget(targetType: CommentTargetType, targetId: string): Promise<CommentTarget | null> {
  if (targetType === "objective") {
    const [target] = await db
      .select({ teamId: objectives.teamId, title: objectives.title })
      .from(objectives)
      .where(eq(objectives.id, targetId))
      .limit(1);
    return target ?? null;
  }

  if (targetType === "result") {
    const [target] = await db
      .select({ teamId: results.teamId, title: results.title })
      .from(results)
      .where(eq(results.id, targetId))
      .limit(1);
    return target ?? null;
  }

  if (targetType === "task") {
    const [target] = await db
      .select({ teamId: tasks.teamId, title: tasks.title })
      .from(tasks)
      .where(eq(tasks.id, targetId))
      .limit(1);
    return target ?? null;
  }

  const [target] = await db
    .select({ teamId: tasks.teamId, title: taskChecklistItems.label })
    .from(taskChecklistItems)
    .innerJoin(tasks, eq(tasks.id, taskChecklistItems.taskId))
    .where(eq(taskChecklistItems.id, targetId))
    .limit(1);
  return target ?? null;
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

  const targetTitle = input.targetTitle.trim() || target.title;
  const createdAt = nowIso();
  const threadId = await db.transaction(async (tx) => {
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
        replyToMessageId: input.replyToMessageId ?? null,
        replyToAuthor: input.replyToAuthor ?? null,
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
        teamId: target.teamId,
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

export async function submitObjectiveLootComment(objectiveId: string, body: string, actor: CommentActor): Promise<CommentMutationOutcome> {
  const [objective] = await db.select().from(objectives).where(eq(objectives.id, objectiveId)).limit(1);
  if (!objective) {
    return { status: "notFound" };
  }

  const outcome = await createComment(
    {
      targetType: "objective",
      targetId: objective.id,
      targetTitle: objective.title,
      body: `战利品提交：${body}`,
    },
    actor,
  );
  if (outcome.status !== "ok") {
    return outcome;
  }

  await db.update(objectives).set({ lootSubmittedAt: nowIso(), updatedAt: today() }).where(eq(objectives.id, objectiveId));

  return outcome;
}

export async function createTask(input: CreateTaskInput): Promise<Task | null> {
  const [result] = await db.select().from(results).where(eq(results.id, input.linkedResultId)).limit(1);
  if (!result) {
    return null;
  }

  const siblingRows = await db.select({ sortOrder: tasks.sortOrder }).from(tasks).where(eq(tasks.linkedResultId, result.id));
  const sortOrder = siblingRows.reduce((max, row) => Math.max(max, row.sortOrder), -1) + 1;
  const id = `ORF-${Date.now()}`;
  const now = today();

  await db.insert(tasks).values({
    id,
    teamId: result.teamId,
    title: input.title,
    description: input.description ?? "执行支撑关联指标的下一步动作。",
    status: "Todo",
    priority: input.priority ?? "Medium",
    assignee: input.assignee || "User",
    linkedObjectiveId: result.objectiveId,
    linkedResultId: result.id,
    feedbackOriginId: input.feedbackOriginId ?? null,
    dueDate: input.dueDate ?? now,
    tags: ["ORF"],
    createdAt: now,
    updatedAt: now,
    sortOrder,
  });

  const data = await getTaskManagementData();
  return data.tasks.find((task) => task.id === id) ?? null;
}

export async function createChecklistItem(taskId: string, input: CreateChecklistItemInput): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [task] = await tx.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
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
      label: input.label ?? "新子任务",
      done: false,
      sortOrder: insertIndex,
      updatedAt: today(),
    });

    await Promise.all(
      orderedIds.map((itemId, index) =>
        tx.update(taskChecklistItems).set({ sortOrder: index }).where(and(eq(taskChecklistItems.taskId, taskId), eq(taskChecklistItems.id, itemId))),
      ),
    );
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
  const updated = await db.update(objectives).set({ stage, updatedAt: today() }).where(eq(objectives.id, objectiveId)).returning({ id: objectives.id });
  return updated.length > 0;
}

export async function updateResultTitle(resultId: string, title: string): Promise<boolean> {
  const nextTitle = title.trim();
  if (!nextTitle) {
    return false;
  }

  return db.transaction(async (tx) => {
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
    const [objective] = await tx.select({ id: objectives.id }).from(objectives).where(eq(objectives.id, objectiveId)).limit(1);
    if (!objective) {
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
    const [result] = await tx.select({ id: results.id }).from(results).where(eq(results.id, resultId)).limit(1);
    if (!result) {
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
    const [task] = await tx.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
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
    await Promise.all(
      rows.map((row, index) => tx.update(taskChecklistItems).set({ sortOrder: index }).where(eq(taskChecklistItems.id, row.id))),
    );
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

    const rows = await tx
      .select({ id: results.id })
      .from(results)
      .where(eq(results.objectiveId, moving.objectiveId))
      .orderBy(results.sortOrder);
    const orderedIds = reorderIds(rows.map((row) => row.id), resultId, referenceResultId, placement);
    await Promise.all(orderedIds.map((id, index) => tx.update(results).set({ sortOrder: index }).where(eq(results.id, id))));
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

    const affectedResultIds = Array.from(new Set([task.linkedResultId, targetResult.id]));
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

      await Promise.all(orderedIds.map((id, index) => tx.update(tasks).set({ sortOrder: index }).where(eq(tasks.id, id))));
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
    if (input.referenceItemId) {
      const [referenceItem] = await tx.select().from(taskChecklistItems).where(eq(taskChecklistItems.id, input.referenceItemId)).limit(1);
      if (!referenceItem || referenceItem.taskId !== input.toTaskId || referenceItem.id === itemId) {
        return false;
      }
    }

    await tx.update(taskChecklistItems).set({ taskId: input.toTaskId, updatedAt: today() }).where(eq(taskChecklistItems.id, itemId));

    const affectedTaskIds = Array.from(new Set([taskId, input.toTaskId]));
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

      await Promise.all(orderedIds.map((id, index) => tx.update(taskChecklistItems).set({ sortOrder: index }).where(eq(taskChecklistItems.id, id))));
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
