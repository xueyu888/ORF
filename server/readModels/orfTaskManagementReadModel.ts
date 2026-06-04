import { desc, eq, inArray } from "drizzle-orm";
import { initialOrfState } from "../../src/data/initialOrfState";
import type { TaskManagementData } from "../../src/domain/orfReadModel";
import { objectiveParticipantSnapshot } from "../../src/domain/orfObjectiveParticipants";
import { objectiveBasePointsForResults, uncertaintyScoreFor } from "../../src/domain/orfSettlement";
import type {
  CommentAttachment,
  CommentThread,
  Evidence,
  Feedback,
  Objective,
  ObjectiveAlignmentRequest,
  ObjectiveLoot,
  OrfProject,
  ObjectiveTrialReview,
  OrfState,
  PointLedgerEntry,
  Result,
  Task,
  UncertaintyLevel,
} from "../../src/types/orf";
import { addCalendarDays } from "../../src/utils/date";
import { db } from "../db/client";
import {
  commentAttachments,
  commentMessages,
  commentThreads,
  evidence,
  feedback,
  feedbackCauseCategories,
  objectiveAlignmentRequests,
  objectiveLoot,
  objectives,
  objectiveTrialReviews,
  projects,
  pointLedger,
  results,
  resultTrendPoints,
  taskChecklistItems,
  tasks,
  teamMembers,
  teams,
  users,
} from "../db/schema";
import { getPermissionRulesForScope } from "../repositories/permissionRepository";
import { runtimeScope, runtimeScopeStorageId, type RuntimeScope } from "../repositories/runtimeScope";
import { getScopedUsers } from "../repositories/userRepository";
import { getUserAvatarUrlMap } from "../users/avatar/avatarRepository";

export type TaskManagementDataScope = {
  scope?: RuntimeScope | null;
};

type CommentThreadRow = typeof commentThreads.$inferSelect;
type CommentMessageRow = typeof commentMessages.$inferSelect;
type CommentAttachmentRow = typeof commentAttachments.$inferSelect;

function optional<T>(value: T | null): T | undefined {
  return value ?? undefined;
}

function addDays(value: string, days: number) {
  return addCalendarDays(value, days, value);
}

function commentAttachmentContentUrl(id: string) {
  return `/api/comments/attachments/${encodeURIComponent(id)}/content`;
}

function commentAttachmentDto(row: CommentAttachmentRow): CommentAttachment {
  return {
    id: row.id,
    fileName: row.fileName,
    mimeType: row.mimeType,
    fileSize: row.fileSize,
    width: optional(row.width),
    height: optional(row.height),
    contentUrl: commentAttachmentContentUrl(row.id),
  };
}

function groupCommentAttachmentsByMessage(rows: CommentAttachmentRow[]) {
  const grouped = new Map<string, CommentAttachment[]>();
  for (const row of rows) {
    if (!row.messageId) continue;
    const attachments = grouped.get(row.messageId) ?? [];
    attachments.push(commentAttachmentDto(row));
    grouped.set(row.messageId, attachments);
  }
  return grouped;
}

function isMissingCommentStorageError(error: unknown) {
  const cause = error && typeof error === "object" && "cause" in error ? (error as { cause?: unknown }).cause : error;
  if (!cause || typeof cause !== "object" || !("code" in cause)) {
    return false;
  }

  return cause.code === "42P01" || cause.code === "42704";
}

function storageScope(id: string | null | undefined): RuntimeScope | null {
  const storageId = id?.trim();
  return storageId ? runtimeScope(storageId) : null;
}

function scopedStorageId(scope: TaskManagementDataScope = {}) {
  return scope.scope ? runtimeScopeStorageId(scope.scope).trim() : "";
}

async function getCommentRows(scope: TaskManagementDataScope = {}): Promise<[CommentThreadRow[], CommentMessageRow[], CommentAttachmentRow[]]> {
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
    const messageIds = messageRows.map((message) => message.id);
    const attachmentRows =
      messageIds.length > 0
        ? await db.select().from(commentAttachments).where(inArray(commentAttachments.messageId, messageIds))
        : [];

    return [threadRows, messageRows, attachmentRows];
  } catch (error) {
    if (isMissingCommentStorageError(error)) {
      return [[], [], []];
    }

    throw error;
  }
}

function nameForUserId(userNameById: Map<string, string>, userId: string | null | undefined, fallback = "") {
  return userId ? userNameById.get(userId) ?? fallback : fallback;
}

async function getUserMapsForScope(storageScopeId: string | null | undefined) {
  const rows = storageScopeId
    ? await db
        .select({ id: users.id, name: users.name })
        .from(teamMembers)
        .innerJoin(users, eq(teamMembers.userId, users.id))
        .where(eq(teamMembers.teamId, storageScopeId))
    : await db.select({ id: users.id, name: users.name }).from(users);
  return {
    userIdByName: new Map(rows.map((member) => [member.name, member.id])),
    userNameById: new Map(rows.map((member) => [member.id, member.name])),
  };
}

function uncertaintyScore(level: UncertaintyLevel | null) {
  return uncertaintyScoreFor(level);
}

async function getResultTrendRows(resultIds: string[]) {
  if (resultIds.length === 0) return [];
  return db.select().from(resultTrendPoints).where(inArray(resultTrendPoints.resultId, resultIds));
}

async function getChecklistRows(taskIds: string[]) {
  if (taskIds.length === 0) return [];
  return db.select().from(taskChecklistItems).where(inArray(taskChecklistItems.taskId, taskIds));
}

async function getFeedbackCauseRows(feedbackIssueIds: string[]) {
  if (feedbackIssueIds.length === 0) return [];
  return db.select().from(feedbackCauseCategories).where(inArray(feedbackCauseCategories.feedbackId, feedbackIssueIds));
}

export async function getTaskManagementData(scope: TaskManagementDataScope = {}): Promise<TaskManagementData> {
  const storageScopeId = scopedStorageId(scope);
  const objectiveRows = storageScopeId
    ? await db.select().from(objectives).where(eq(objectives.teamId, storageScopeId)).orderBy(desc(objectives.createdAt), desc(objectives.id))
    : await db.select().from(objectives).orderBy(desc(objectives.createdAt), desc(objectives.id));
  const projectRows = storageScopeId ? await db.select().from(projects).where(eq(projects.teamId, storageScopeId)).orderBy(desc(projects.createdAt), desc(projects.id)) : await db.select().from(projects);
  const resultRows = storageScopeId ? await db.select().from(results).where(eq(results.teamId, storageScopeId)) : await db.select().from(results);
  const taskRows = storageScopeId ? await db.select().from(tasks).where(eq(tasks.teamId, storageScopeId)) : await db.select().from(tasks);
  const evidenceRows = storageScopeId ? await db.select().from(evidence).where(eq(evidence.teamId, storageScopeId)) : await db.select().from(evidence);
  const feedbackRows = storageScopeId ? await db.select().from(feedback).where(eq(feedback.teamId, storageScopeId)) : await db.select().from(feedback);
  const objectiveLootRows = storageScopeId ? await db.select().from(objectiveLoot).where(eq(objectiveLoot.teamId, storageScopeId)) : await db.select().from(objectiveLoot);
  const objectiveTrialReviewRows = storageScopeId
    ? await db.select().from(objectiveTrialReviews).where(eq(objectiveTrialReviews.teamId, storageScopeId))
    : await db.select().from(objectiveTrialReviews);
  const objectiveAlignmentRequestRows = storageScopeId
    ? await db.select().from(objectiveAlignmentRequests).where(eq(objectiveAlignmentRequests.teamId, storageScopeId))
    : await db.select().from(objectiveAlignmentRequests);
  const pointLedgerRows = storageScopeId ? await db.select().from(pointLedger).where(eq(pointLedger.teamId, storageScopeId)) : await db.select().from(pointLedger);
  const scopeRows = storageScopeId ? await db.select({ id: teams.id }).from(teams).where(eq(teams.id, storageScopeId)) : await db.select({ id: teams.id }).from(teams);
  const resultIds = resultRows.map((result) => result.id);
  const taskIds = taskRows.map((task) => task.id);
  const feedbackIssueIds = feedbackRows.map((item) => item.id);
  const trendRows = await getResultTrendRows(resultIds);
  const checklistRows = await getChecklistRows(taskIds);
  const causeRows = await getFeedbackCauseRows(feedbackIssueIds);
  const [commentThreadRows, commentMessageRows, commentAttachmentRows] = await getCommentRows({ scope: storageScope(storageScopeId) });
  const commentAuthorAvatarUrls = await getUserAvatarUrlMap(commentMessageRows.map((message) => message.authorUserId).filter((userId): userId is string => Boolean(userId)));
  const permissionRules = scopeRows[0] ? await getPermissionRulesForScope(runtimeScope(scopeRows[0].id)) : initialOrfState.permissionRules;
  const { userIdByName, userNameById } = await getUserMapsForScope(storageScopeId);

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
  const projectItems: OrfProject[] = projectRows.map((project) => ({
    id: project.id,
    name: project.name,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  }));
  const messagesByThread = new Map<string, CommentThread["messages"]>();
  const attachmentsByMessage = groupCommentAttachmentsByMessage(commentAttachmentRows);
  for (const message of [...commentMessageRows].sort(
    (left, right) => left.sortOrder - right.sortOrder || left.createdAt.localeCompare(right.createdAt),
  )) {
    const messages = messagesByThread.get(message.threadId) ?? [];
    messages.push({
      id: message.id,
      author: message.author,
      authorUserId: optional(message.authorUserId),
      authorAvatarUrl: message.authorUserId ? commentAuthorAvatarUrls.get(message.authorUserId) ?? null : null,
      body: message.body,
      attachments: attachmentsByMessage.get(message.id) ?? [],
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
    assignee: nameForUserId(userNameById, task.assigneeUserId, task.assignee),
    assigneeUserId: optional(task.assigneeUserId),
    linkedObjectiveId: task.linkedObjectiveId,
    dueDate: task.dueDate,
    tags: task.tags,
    checklist: checklistByTask.get(task.id) ?? [],
    createdBy: task.createdBy,
    updatedBy: task.updatedBy,
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
    owner: nameForUserId(userNameById, item.ownerUserId, item.owner),
    ownerUserId: optional(item.ownerUserId),
    linkedResultId: item.linkedResultId,
  }));

  const feedbackItems: Feedback[] = feedbackRows.map((item) => ({
    id: item.id,
    phenomenon: item.phenomenon,
    causeCategories: causeCategoriesByFeedback.get(item.id) ?? [],
    impact: item.impact,
    suggestedAdjustment: item.suggestedAdjustment,
    status: item.status,
    owner: nameForUserId(userNameById, item.ownerUserId, item.owner),
    ownerUserId: optional(item.ownerUserId),
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
    definer: nameForUserId(userNameById, result.definerUserId, result.definer),
    definerUserId: optional(result.definerUserId),
    uncertaintyScore: result.uncertaintyScore ?? uncertaintyScore(result.uncertaintyLevel),
    acceptedResult: result.acceptedResult ?? "unreviewed",
    evidenceIds: evidenceItems.filter((item) => item.linkedResultId === result.id).map((item) => item.id),
    trend: trendByResult.get(result.id) ?? [],
    reviewCadence: result.reviewCadence,
    createdAt: result.createdAt,
    updatedAt: result.updatedAt,
  }));

  const objectiveItems: Objective[] = objectiveRows.map((objective) => {
    const objectiveResults = resultItems.filter((result) => result.objectiveId === objective.id);
    const objectiveBasePoints = objectiveBasePointsForResults(objectiveResults);
    const participants = objectiveParticipantSnapshot({
      challengerUserIds: objective.challengerUserIds,
      challengerNames: objective.challengers ?? [],
      assignedChallengerUserIds: objective.assignedChallengerUserIds,
      assignedChallengerNames: objective.assignedChallengers ?? [],
      userIdByName,
      userNameById,
    });
    const challengeApplications = (objective.challengeApplications ?? []).map((application) => {
      const applicantUserId = application.applicantUserId ?? userIdByName.get(application.applicant) ?? null;
      return {
        ...application,
        applicant: nameForUserId(userNameById, applicantUserId, application.applicant),
        applicantUserId,
      };
    });

    return {
      id: objective.id,
      title: objective.title,
      description: objective.description,
      whyItMatters: objective.whyItMatters,
      projectId: objective.projectId,
      cycle: objective.cycle,
      stage: objective.stage,
      flowStatus: objective.flowStatus,
      status: objective.status,
      confidence: objective.confidence,
      progress: Math.max(0, Math.min(100, Math.round(objective.progress))),
      boundary: objective.boundary,
      successDefinition: objective.successDefinition,
      resultIds: objectiveResults.map((result) => result.id),
      taskIds: taskItems.filter((task) => task.linkedObjectiveId === objective.id).map((task) => task.id),
      finalDueAt: objective.finalDueAt || addDays(objective.updatedAt, 14),
      challengers: participants.challengers,
      challengerUserIds: participants.challengerUserIds,
      assignedChallengers: participants.assignedChallengers,
      assignedChallengerUserIds: participants.assignedChallengerUserIds,
      challengeApplications,
      acceptedAt: objective.acceptedAt,
      confirmationDueAt: objective.confirmationDueAt,
      confirmedAt: objective.confirmedAt,
      lootSubmittedAt: objective.lootSubmittedAt,
      acceptedResult: objective.acceptedResult,
      completionMultiplier: objective.completionMultiplier,
      objectiveBasePoints,
      objectiveSettlementPoints: objective.objectiveSettlementPoints,
      publishedAt: objective.publishedAt,
      createdAt: objective.createdAt,
      updatedAt: objective.updatedAt,
    };
  });
  const objectiveLootItems: ObjectiveLoot[] = objectiveLootRows
    .sort((left, right) => right.submittedAt.localeCompare(left.submittedAt))
    .map((item) => ({
      id: item.id,
      objectiveId: item.objectiveId,
      submittedBy: nameForUserId(userNameById, item.submittedByUserId, item.submittedBy),
      submittedByUserId: optional(item.submittedByUserId),
      body: item.body,
      resultClaims: item.resultClaims,
      selfTestReportUrl: item.selfTestReportUrl,
      selfTestReportBody: item.selfTestReportBody,
      submittedAt: item.submittedAt,
    }));
  const objectiveTrialReviewItems: ObjectiveTrialReview[] = objectiveTrialReviewRows
    .sort((left, right) => right.requestedAt.localeCompare(left.requestedAt))
    .map((item) => ({
      id: item.id,
      objectiveId: item.objectiveId,
      requestedBy: nameForUserId(userNameById, item.requestedByUserId, item.requestedBy),
      requestedByUserId: optional(item.requestedByUserId),
      body: item.body,
      resultClaims: item.resultClaims,
      selfTestReportBody: item.selfTestReportBody,
      status: item.status,
      commanderFeedback: item.commanderFeedback,
      reviewedBy: item.reviewedByUserId || item.reviewedBy ? nameForUserId(userNameById, item.reviewedByUserId, item.reviewedBy ?? "") : null,
      reviewedByUserId: optional(item.reviewedByUserId),
      reviewedAt: item.reviewedAt,
      requestedAt: item.requestedAt,
    }));
  const objectiveAlignmentRequestItems: ObjectiveAlignmentRequest[] = objectiveAlignmentRequestRows
    .sort((left, right) => right.proposedAt.localeCompare(left.proposedAt))
    .map((item) => ({
      id: item.id,
      objectiveId: item.objectiveId,
      kind: item.kind,
      requestedBy: nameForUserId(userNameById, item.requestedByUserId, item.requestedBy),
      requestedByUserId: optional(item.requestedByUserId),
      status: item.status,
      proposedAt: item.proposedAt,
      scheduledAt: item.scheduledAt,
      meetingRoom: item.meetingRoom,
      note: item.note,
      commanderFeedback: item.commanderFeedback,
      reviewedBy: item.reviewedByUserId || item.reviewedBy ? nameForUserId(userNameById, item.reviewedByUserId, item.reviewedBy ?? "") : null,
      reviewedByUserId: optional(item.reviewedByUserId),
      reviewedAt: item.reviewedAt,
    }));
  const pointLedgerItems: PointLedgerEntry[] = pointLedgerRows
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .map((item) => ({
      id: item.id,
      objectiveId: item.objectiveId,
      userId: item.userId,
      memberName: nameForUserId(userNameById, item.userId, item.memberName),
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
    projects: projectItems,
    objectives: objectiveItems,
    results: resultItems,
    tasks: taskItems,
    evidence: evidenceItems,
    feedback: feedbackItems,
    comments: commentItems,
    objectiveLoot: objectiveLootItems,
    objectiveTrialReviews: objectiveTrialReviewItems,
    objectiveAlignmentRequests: objectiveAlignmentRequestItems,
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
      requireResultForTask: false,
      requireEvidenceForFeedback: true,
      weeklyFeedbackCadence: true,
      autoCreateReviewSummary: false,
    },
  };
}
