import { and, eq, inArray, or } from "drizzle-orm";
import { initialOrfState } from "../../src/data/initialOrfState";
import type {
  AutomaticCompletionResult,
  BountySource,
  ChallengeApplication,
  CommentStatus,
  CommentTargetType,
  CommentThread,
  Evidence,
  Feedback,
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
import { buildAutomaticCompletionSnapshot, calculateAutomaticCompletion } from "../utils/automaticCompletion";

export type TaskManagementData = Pick<
  OrfState,
  "objectives" | "results" | "tasks" | "evidence" | "feedback" | "comments" | "permissionRules" | "automaticCompletions"
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

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function objectiveProgress(objective: Objective, resultItems: Result[], automaticCompletion?: AutomaticCompletionResult) {
  if (!automaticCompletion) {
    return Math.max(0, Math.min(100, Math.round(objective.progress)));
  }

  const objectiveResults = resultItems.filter((result) => result.objectiveId === objective.id);
  return Math.round(average(objectiveResults.map((result) => automaticCompletion.rets[result.id] ?? 0)) * 100);
}

function calculateAutomaticCompletions(state: Pick<OrfState, "objectives" | "results" | "tasks">): Record<string, AutomaticCompletionResult> {
  const completions: Record<string, AutomaticCompletionResult> = {};

  for (const objective of state.objectives) {
    if (objective.stage !== "goalFrozen") {
      continue;
    }

    const snapshot = buildAutomaticCompletionSnapshot(state, objective.id);
    if (snapshot) {
      completions[objective.id] = calculateAutomaticCompletion(snapshot);
    }
  }

  return completions;
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
    owner: result.owner,
    source: result.source,
    definer: result.definer,
    finalDueAt: optional(result.finalDueAt),
    assignedChallenger: result.assignedChallenger,
    acceptedAt: result.acceptedAt,
    confirmationDueAt: result.confirmationDueAt,
    confirmedAt: result.confirmedAt,
    priorityChallengeExpiresAt: result.priorityChallengeExpiresAt,
    priorityDeclinedBy: result.priorityDeclinedBy ?? [],
    challengeApplications: result.challengeApplications ?? [],
    evidenceIds: evidenceItems.filter((item) => item.linkedResultId === result.id).map((item) => item.id),
    taskIds: taskItems.filter((task) => task.linkedResultId === result.id).map((task) => task.id),
    feedbackIds: feedbackItems.filter((item) => item.linkedResultId === result.id).map((item) => item.id),
    trend: trendByResult.get(result.id) ?? [],
    reviewCadence: result.reviewCadence,
  }));

  const objectiveItems: Objective[] = objectiveRows.map((objective) => ({
      id: objective.id,
      title: objective.title,
      description: objective.description,
      whyItMatters: objective.whyItMatters,
      cycle: objective.cycle,
      stage: objective.stage,
      status: objective.status,
      confidence: objective.confidence,
      progress: objective.progress,
      boundary: objective.boundary,
      successDefinition: objective.successDefinition,
      resultIds: resultItems.filter((result) => result.objectiveId === objective.id).map((result) => result.id),
      feedbackIds: feedbackItems.filter((item) => item.linkedObjectiveId === objective.id).map((item) => item.id),
      taskIds: taskItems.filter((task) => task.linkedObjectiveId === objective.id).map((task) => task.id),
      createdAt: objective.createdAt,
      updatedAt: objective.updatedAt,
    }));
  const automaticCompletions = calculateAutomaticCompletions({ objectives: objectiveItems, results: resultItems, tasks: taskItems });
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
    objectives: objectiveItems.map((objective) => ({
      ...objective,
      progress: objectiveProgress(objective, resultItems, automaticCompletions[objective.id]),
    })),
    results: resultItems,
    tasks: taskItems,
    evidence: evidenceItems,
    feedback: feedbackItems,
    comments: commentItems,
    permissionRules,
    automaticCompletions,
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
  owner?: string;
  source?: BountySource;
  definer?: string;
  finalDueAt?: string;
  assignedChallenger?: string | null;
  priorityChallengeExpiresAt?: string | null;
  priorityDeclinedBy?: string[];
  challengeApplications?: ChallengeApplication[];
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  assignee?: string;
  priority?: Priority;
  linkedObjectiveId?: string;
  linkedResultId: string;
  dueDate?: string;
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
    owner: input.owner ?? "",
    source: input.source ?? "managerDefined",
    definer: input.definer ?? "",
    finalDueAt: input.finalDueAt ?? addDays(today(), 14),
    assignedChallenger: input.assignedChallenger ?? null,
    priorityChallengeExpiresAt: input.priorityChallengeExpiresAt ?? null,
    priorityDeclinedBy: input.priorityDeclinedBy ?? [],
    challengeApplications: input.challengeApplications ?? [],
    reviewCadence: "Weekly",
    sortOrder,
  });

  const data = await getTaskManagementData();
  return data.results.find((result) => result.id === id) ?? null;
}

export type AcceptResultChallengeOutcome =
  | { status: "accepted"; result: Result }
  | { status: "alreadyAccepted"; owner: string }
  | { status: "invalidDueDate" }
  | { status: "notFound" };

export async function acceptResultChallenge(resultId: string, challenger: string): Promise<AcceptResultChallengeOutcome> {
  const nextOwner = challenger.trim();
  if (!nextOwner) {
    return { status: "notFound" };
  }

  const [result] = await db.select().from(results).where(eq(results.id, resultId)).limit(1);
  if (!result) {
    return { status: "notFound" };
  }

  const currentOwner = result.owner.trim();
  if (currentOwner && currentOwner !== "User" && currentOwner !== "未分配" && currentOwner !== nextOwner) {
    return { status: "alreadyAccepted", owner: result.owner };
  }

  const acceptedAt = nowIso();
  const nextConfirmationDueAt = confirmationDueAt(result.finalDueAt, acceptedAt);
  if (!nextConfirmationDueAt) {
    return { status: "invalidDueDate" };
  }

  await db
    .update(results)
    .set({
      owner: nextOwner,
      assignedChallenger: result.assignedChallenger === nextOwner ? null : result.assignedChallenger,
      acceptedAt: result.acceptedAt ?? acceptedAt,
      confirmationDueAt: result.confirmationDueAt ?? nextConfirmationDueAt,
      challengeApplications: (result.challengeApplications ?? []).map((application) =>
        application.applicant === nextOwner && application.status === "pending" ? { ...application, status: "approved", decidedAt: acceptedAt } : application,
      ),
      status: result.status === "Draft" ? "On Track" : result.status,
    })
    .where(eq(results.id, resultId));

  const data = await getTaskManagementData();
  const accepted = data.results.find((item) => item.id === resultId);
  return accepted ? { status: "accepted", result: accepted } : { status: "notFound" };
}

export type ApplyResultChallengeOutcome =
  | { status: "applied"; result: Result }
  | { status: "alreadyApplied" }
  | { status: "alreadyAccepted"; owner: string }
  | { status: "notFound" };

export async function applyForResultChallenge(resultId: string, applicant: string): Promise<ApplyResultChallengeOutcome> {
  const nextApplicant = applicant.trim();
  if (!nextApplicant) {
    return { status: "notFound" };
  }

  const [result] = await db.select().from(results).where(eq(results.id, resultId)).limit(1);
  if (!result) {
    return { status: "notFound" };
  }

  const currentOwner = result.owner.trim();
  if (currentOwner && currentOwner !== "User" && currentOwner !== "未分配") {
    return { status: "alreadyAccepted", owner: result.owner };
  }

  const applications = result.challengeApplications ?? [];
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
    .update(results)
    .set({
      challengeApplications: [application, ...applications],
    })
    .where(eq(results.id, resultId));

  const data = await getTaskManagementData();
  const applied = data.results.find((item) => item.id === resultId);
  return applied ? { status: "applied", result: applied } : { status: "notFound" };
}

export type DeclinePriorityChallengeOutcome =
  | { status: "declined"; result: Result }
  | { status: "alreadyDeclined" }
  | { status: "notAllowed" }
  | { status: "notFound" };

export async function declinePriorityChallenge(resultId: string, member: string): Promise<DeclinePriorityChallengeOutcome> {
  const currentMember = member.trim();
  if (!currentMember) {
    return { status: "notFound" };
  }

  const [result] = await db.select().from(results).where(eq(results.id, resultId)).limit(1);
  if (!result) {
    return { status: "notFound" };
  }
  if (result.definer !== currentMember) {
    return { status: "notAllowed" };
  }

  const declinedBy = new Set(result.priorityDeclinedBy ?? []);
  if (declinedBy.has(currentMember)) {
    return { status: "alreadyDeclined" };
  }
  declinedBy.add(currentMember);

  await db
    .update(results)
    .set({
      priorityDeclinedBy: Array.from(declinedBy),
    })
    .where(eq(results.id, resultId));

  const data = await getTaskManagementData();
  const declined = data.results.find((item) => item.id === resultId);
  return declined ? { status: "declined", result: declined } : { status: "notFound" };
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

export async function submitLootComment(resultId: string, body: string, actor: CommentActor): Promise<CommentMutationOutcome> {
  const [result] = await db.select().from(results).where(eq(results.id, resultId)).limit(1);
  if (!result) {
    return { status: "notFound" };
  }

  const outcome = await createComment(
    {
      targetType: "result",
      targetId: result.id,
      targetTitle: result.title,
      body: `战利品提交：${body}`,
    },
    actor,
  );
  if (outcome.status !== "ok") {
    return outcome;
  }

  await db.transaction(async (tx) => {
    const taskRows = await tx
      .select({ id: tasks.id, status: tasks.status })
      .from(tasks)
      .where(eq(tasks.linkedResultId, resultId));
    await Promise.all(
      taskRows
        .filter((task) => task.status !== "Done")
        .map((task) => tx.update(tasks).set({ status: "In Review", updatedAt: today() }).where(eq(tasks.id, task.id))),
    );
  });

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
    feedbackOriginId: null,
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
