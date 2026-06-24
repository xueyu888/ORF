import { desc, eq, inArray } from "drizzle-orm";
import { initialOrfState } from "../../src/data/initialOrfState";
import type { TaskManagementData } from "../../src/domain/orfReadModel";
import type {
  CommentThread,
  Evidence,
  Feedback,
  Objective,
  ObjectiveAlignmentRequest,
  ObjectiveLoot,
  OrfProject,
  ObjectiveTrialReview,
  OrfState,
  OrfUserDisplayProfile,
  Result,
  Task,
} from "../../src/types/orf";
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
  teams,
} from "../db/schema";
import { getPermissionRulesForScope } from "../repositories/permissionRepository";
import { runtimeScope, runtimeScopeStorageId, type RuntimeScope } from "../repositories/runtimeScope";
import { getScopedUsers } from "../repositories/userRepository";
import { groupCommentAttachmentsByMessage } from "../repositories/commentAttachmentRepository";
import { getUserAvatarUrlMap } from "../users/avatar/avatarRepository";
import { uniqueParticipantUserIds } from "../../src/domain/orfObjectiveParticipants";
import {
  getUserMapsForStorageScope,
  groupEvidenceIdsByResult,
  groupResultTrends,
  groupResultsByObjective,
  groupTaskIdsByObjective,
  mapObjectiveRows,
  mapPointLedgerRows,
  mapResultRows,
  nameForUserId,
  optional,
} from "./orfReadModelMappers";

export type TaskManagementDataScope = {
  scope?: RuntimeScope | null;
};

type CommentThreadRow = typeof commentThreads.$inferSelect;
type CommentMessageRow = typeof commentMessages.$inferSelect;
type CommentAttachmentRow = typeof commentAttachments.$inferSelect;
type TaskRow = typeof tasks.$inferSelect;

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

function taskDefinitionContributorUserIds(task: TaskRow) {
  return task.definitionContributorUserIds.length > 0
    ? uniqueParticipantUserIds(task.definitionContributorUserIds)
    : uniqueParticipantUserIds([task.createdBy, task.updatedBy]);
}

function addUserId(ids: Set<string>, value: string | null | undefined) {
  const userId = value?.trim();
  if (userId) ids.add(userId);
}

function addUserIds(ids: Set<string>, values: Array<string | null | undefined> | undefined) {
  for (const value of values ?? []) {
    addUserId(ids, value);
  }
}

function addObjectiveUserIds(ids: Set<string>, objective: Objective) {
  addUserIds(ids, objective.challengerUserIds);
  addUserIds(ids, objective.assignedChallengerUserIds);
  for (const application of objective.challengeApplications ?? []) {
    addUserId(ids, application.applicantUserId);
  }
}

export function userProfilesForTaskManagementData(
  data: TaskManagementData,
  profiles: readonly OrfUserDisplayProfile[] = data.userProfiles,
) {
  const ids = new Set<string>();
  for (const objective of data.objectives) {
    addObjectiveUserIds(ids, objective);
  }
  for (const result of data.results) {
    addUserId(ids, result.definerUserId);
  }
  for (const task of data.tasks) {
    addUserId(ids, task.assigneeUserId);
    addUserId(ids, task.createdBy);
    addUserId(ids, task.updatedBy);
    addUserIds(ids, task.definitionContributorUserIds);
  }
  for (const item of data.evidence) {
    addUserId(ids, item.ownerUserId);
  }
  for (const item of data.feedback) {
    addUserId(ids, item.ownerUserId);
    addUserId(ids, item.createdBy);
    addUserId(ids, item.updatedBy);
  }
  for (const item of data.objectiveLoot) {
    addUserId(ids, item.submittedByUserId);
  }
  for (const item of data.objectiveTrialReviews) {
    addUserId(ids, item.requestedByUserId);
    addUserId(ids, item.reviewedByUserId);
  }
  for (const item of data.objectiveAlignmentRequests) {
    addUserId(ids, item.requestedByUserId);
    addUserId(ids, item.reviewedByUserId);
  }
  for (const item of data.pointLedger) {
    addUserId(ids, item.userId);
  }
  for (const thread of data.comments) {
    addUserId(ids, thread.createdBy);
    for (const message of thread.messages) {
      addUserId(ids, message.authorUserId);
    }
  }
  for (const pending of data.pendingChallengeApplications) {
    addUserId(ids, pending.application.applicantUserId);
    addObjectiveUserIds(ids, pending.objective);
    for (const result of pending.results) {
      addUserId(ids, result.definerUserId);
    }
  }

  return profiles.filter((profile) => ids.has(profile.id));
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
  const resultIds = resultRows.map((result) => result.id);
  const taskIds = taskRows.map((task) => task.id);
  const feedbackIssueIds = feedbackRows.map((item) => item.id);
  const trendRows = await getResultTrendRows(resultIds);
  const checklistRows = await getChecklistRows(taskIds);
  const causeRows = await getFeedbackCauseRows(feedbackIssueIds);
  const [commentThreadRows, commentMessageRows, commentAttachmentRows] = await getCommentRows({ scope: storageScope(storageScopeId) });
  const { userNameById, userProfiles: scopeUserProfiles } = await getUserMapsForStorageScope(storageScopeId);
  const orderedTaskRows = [...taskRows].sort((left, right) => left.sortOrder - right.sortOrder);
  const objectiveParticipantAvatarUrls = await getUserAvatarUrlMap(objectiveRows.flatMap((objective) => [...objective.challengerUserIds, ...objective.assignedChallengerUserIds]));
  const commentAuthorAvatarUrls = await getUserAvatarUrlMap(commentMessageRows.map((message) => message.authorUserId).filter((userId): userId is string => Boolean(userId)));
  const taskDefinitionContributorAvatarUrls = await getUserAvatarUrlMap(
    orderedTaskRows.flatMap((task) => uniqueParticipantUserIds([...taskDefinitionContributorUserIds(task), task.createdBy])),
  );

  const checklistByTask = new Map<string, Task["checklist"]>();
  for (const item of checklistRows.sort((left, right) => left.sortOrder - right.sortOrder)) {
    const list = checklistByTask.get(item.taskId) ?? [];
    list.push({ id: item.id, label: item.label, done: item.done, updatedAt: item.updatedAt });
    checklistByTask.set(item.taskId, list);
  }

  const trendByResult = groupResultTrends(trendRows);

  const causeCategoriesByFeedback = new Map<string, string[]>();
  for (const item of causeRows.sort((left, right) => left.sortOrder - right.sortOrder)) {
    const list = causeCategoriesByFeedback.get(item.feedbackId) ?? [];
    list.push(item.category);
    causeCategoriesByFeedback.set(item.feedbackId, list);
  }

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
  const firstFeedbackMessageByTarget = new Map<string, string>();
  for (const thread of [...commentThreadRows].sort((left, right) => left.createdAt.localeCompare(right.createdAt))) {
    if (thread.targetType !== "feedback") continue;
    const firstMessage = messagesByThread.get(thread.id)?.[0];
    if (firstMessage && !firstFeedbackMessageByTarget.has(thread.targetId)) {
      firstFeedbackMessageByTarget.set(thread.targetId, firstMessage.body);
    }
  }

  const taskItems: Task[] = orderedTaskRows.map((task) => {
    const definitionContributorUserIds = taskDefinitionContributorUserIds(task);
    return {
      id: task.id,
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      assignee: nameForUserId(userNameById, task.assigneeUserId, task.assignee),
      assigneeUserId: task.assigneeUserId,
      linkedObjectiveId: task.linkedObjectiveId,
      dueDate: task.dueDate,
      tags: task.tags,
      checklist: checklistByTask.get(task.id) ?? [],
      createdBy: task.createdBy,
      createdByName: task.createdBy ? nameForUserId(userNameById, task.createdBy) || null : null,
      createdByAvatarUrl: task.createdBy ? taskDefinitionContributorAvatarUrls.get(task.createdBy) ?? null : null,
      updatedBy: task.updatedBy,
      definitionContributorUserIds,
      definitionContributorProfiles: definitionContributorUserIds.map((userId) => ({
        userId,
        name: nameForUserId(userNameById, userId, "未知成员"),
        avatarUrl: taskDefinitionContributorAvatarUrls.get(userId) ?? null,
      })),
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    };
  });

  const evidenceItems: Evidence[] = evidenceRows.map((item) => ({
    id: item.id,
    type: item.type,
    title: item.title,
    summary: item.summary,
    source: item.source,
    date: item.date,
    owner: nameForUserId(userNameById, item.ownerUserId, item.owner),
    ownerUserId: item.ownerUserId,
    linkedResultId: item.linkedResultId,
  }));

  const feedbackItems: Feedback[] = feedbackRows.map((item) => ({
    id: item.id,
    phenomenon: item.phenomenon,
    causeCategories: causeCategoriesByFeedback.get(item.id) ?? [],
    impact: item.impact,
    suggestedAdjustment: firstFeedbackMessageByTarget.get(item.id) ?? item.suggestedAdjustment ?? "",
    status: item.status,
    owner: nameForUserId(userNameById, item.ownerUserId, item.owner),
    ownerUserId: item.ownerUserId,
    createdBy: item.createdBy,
    updatedBy: item.updatedBy,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    activity: [],
  }));

  const resultItems: Result[] = mapResultRows({
    evidenceIdsByResult: groupEvidenceIdsByResult(evidenceRows),
    resultRows: orderedResultRows,
    trendByResult,
    userNameById,
  });

  const objectiveItems: Objective[] = mapObjectiveRows({
    objectiveRows,
    resultsByObjective: groupResultsByObjective(resultItems),
    taskIdsByObjective: groupTaskIdsByObjective(taskItems),
    userAvatarUrlById: objectiveParticipantAvatarUrls,
    userNameById,
  });
  const objectiveLootItems: ObjectiveLoot[] = objectiveLootRows
    .sort((left, right) => right.submittedAt.localeCompare(left.submittedAt))
    .map((item) => ({
      id: item.id,
      objectiveId: item.objectiveId,
      submittedBy: nameForUserId(userNameById, item.submittedByUserId, item.submittedBy),
      submittedByUserId: item.submittedByUserId,
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
      requestedByUserId: item.requestedByUserId,
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
      requestedByUserId: item.requestedByUserId,
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
  const pointLedgerItems = mapPointLedgerRows({ pointLedgerRows, userNameById });
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

  const data: TaskManagementData = {
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
    userProfiles: [],
    pendingChallengeApplications: [],
  };
  return {
    ...data,
    userProfiles: userProfilesForTaskManagementData(data, scopeUserProfiles),
  };
}

export async function getOrfStateSnapshot(scope: TaskManagementDataScope = {}): Promise<OrfState> {
  const storageScopeId = scopedStorageId(scope);
  const data = await getTaskManagementData(scope);
  const [scopeRow] = storageScopeId
    ? await db.select({ id: teams.id }).from(teams).where(eq(teams.id, storageScopeId)).limit(1)
    : await db.select({ id: teams.id }).from(teams).limit(1);
  const scopeUsers = scopeRow ? await getScopedUsers(runtimeScope(scopeRow.id)) : initialOrfState.users;
  const permissionRules = scopeRow ? await getPermissionRulesForScope(runtimeScope(scopeRow.id)) : initialOrfState.permissionRules;

  return {
    ...data,
    users: scopeUsers,
    currentUserId: scopeUsers[0]?.id ?? initialOrfState.currentUserId,
    permissionRules,
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
