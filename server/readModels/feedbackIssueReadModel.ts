import { and, desc, eq, inArray, or } from "drizzle-orm";
import type { FeedbackIssueReadModelData } from "../../src/domain/feedbackReadModel";
import type { CommentThread, Feedback, OrfProject } from "../../src/types/orf";
import {
  feedback,
  feedbackActivityEvents,
  feedbackCauseCategories,
  feedbackRelations,
  feedbackReportAttachments,
  feedbackUserViews,
} from "../../modules/feedback/src/infrastructure/database/schema";
import { db } from "../db/client";
import {
  commentAttachments,
  commentMessages,
  commentThreads,
  projects,
} from "../db/schema";
import { feedbackReportAttachmentDto } from "../feedback/feedbackReportAttachments";
import { groupCommentAttachmentsByMessage } from "../repositories/commentAttachmentRepository";
import { runtimeScopeStorageId, type RuntimeScope } from "../repositories/runtimeScope";
import { getScopedUsers } from "../repositories/userRepository";
import { getUserAvatarUrlMap } from "../users/avatar/avatarRepository";
import { optional } from "./orfReadModelMappers";

export type FeedbackIssueReadModelScope = {
  scope: RuntimeScope;
  viewerUserId?: string | null;
};

type FeedbackRow = typeof feedback.$inferSelect;
type FeedbackCauseRow = typeof feedbackCauseCategories.$inferSelect;
type FeedbackActivityRow = typeof feedbackActivityEvents.$inferSelect;
type FeedbackRelationRow = typeof feedbackRelations.$inferSelect;
type FeedbackReportAttachmentRow = typeof feedbackReportAttachments.$inferSelect;
type FeedbackUserViewRow = {
  feedbackId: string;
  lastSeenSequence: number;
};
type ProjectRow = typeof projects.$inferSelect;
type CommentThreadRow = typeof commentThreads.$inferSelect;
type CommentMessageRow = typeof commentMessages.$inferSelect;
type CommentAttachmentRow = typeof commentAttachments.$inferSelect;

function feedbackReadModelStorageId(scope: FeedbackIssueReadModelScope) {
  const storageId = runtimeScopeStorageId(scope.scope).trim();
  if (!storageId) {
    throw new Error("Runtime scope is required");
  }
  return storageId;
}

function isMissingCommentStorageError(error: unknown) {
  const cause = error && typeof error === "object" && "cause" in error ? (error as { cause?: unknown }).cause : error;
  if (!cause || typeof cause !== "object" || !("code" in cause)) {
    return false;
  }

  return cause.code === "42P01" || cause.code === "42704";
}

export async function getFeedbackRows(storageScopeId: string) {
  return db
    .select()
    .from(feedback)
    .where(eq(feedback.teamId, storageScopeId))
    .orderBy(desc(feedback.updatedAt), desc(feedback.createdAt), desc(feedback.id));
}

export async function getFeedbackCauseRows(feedbackIssueIds: string[]) {
  if (feedbackIssueIds.length === 0) return [];
  return db.select().from(feedbackCauseCategories).where(inArray(feedbackCauseCategories.feedbackId, feedbackIssueIds));
}

export async function getFeedbackActivityRows(feedbackIssueIds: string[]) {
  if (feedbackIssueIds.length === 0) return [];
  return db.select().from(feedbackActivityEvents).where(inArray(feedbackActivityEvents.feedbackId, feedbackIssueIds));
}

export async function getFeedbackReportAttachmentRows(feedbackIssueIds: string[]) {
  if (feedbackIssueIds.length === 0) return [];
  return db.select().from(feedbackReportAttachments).where(inArray(feedbackReportAttachments.feedbackId, feedbackIssueIds));
}

export async function getFeedbackRelationRows(feedbackIssueIds: string[]) {
  if (feedbackIssueIds.length === 0) return [];
  return db
    .select()
    .from(feedbackRelations)
    .where(or(inArray(feedbackRelations.sourceFeedbackId, feedbackIssueIds), inArray(feedbackRelations.targetFeedbackId, feedbackIssueIds)));
}

export async function getFeedbackUserViewRows(teamId: string, feedbackIssueIds: string[], viewerUserId: string | null | undefined) {
  const normalizedViewerUserId = viewerUserId?.trim();
  if (!normalizedViewerUserId || feedbackIssueIds.length === 0) return [];
  return db
    .select({
      feedbackId: feedbackUserViews.feedbackId,
      lastSeenSequence: feedbackUserViews.lastSeenSequence,
    })
    .from(feedbackUserViews)
    .where(
      and(
        eq(feedbackUserViews.teamId, teamId),
        eq(feedbackUserViews.userId, normalizedViewerUserId),
        inArray(feedbackUserViews.feedbackId, feedbackIssueIds),
      ),
    );
}

export function mapProjectRows(projectRows: readonly ProjectRow[]): OrfProject[] {
  return projectRows.map((project) => ({
    id: project.id,
    name: project.name,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  }));
}

export function mapFeedbackIssueRows(input: {
  activityRows: readonly FeedbackActivityRow[];
  causeRows: readonly FeedbackCauseRow[];
  feedbackRows: readonly FeedbackRow[];
  relationRows: readonly FeedbackRelationRow[];
  reportAttachmentRows: readonly FeedbackReportAttachmentRow[];
  userViewRows: readonly FeedbackUserViewRow[];
  viewerUserId?: string | null;
}): Feedback[] {
  const causeCategoriesByFeedback = new Map<string, string[]>();
  for (const item of [...input.causeRows].sort((left, right) => left.sortOrder - right.sortOrder)) {
    const list = causeCategoriesByFeedback.get(item.feedbackId) ?? [];
    list.push(item.category);
    causeCategoriesByFeedback.set(item.feedbackId, list);
  }

  const activityByFeedback = new Map<string, Feedback["activity"]>();
  const lastActivitySequenceByFeedback = new Map<string, number>();
  const lastActivityActorByFeedback = new Map<string, string | null>();
  const lastOtherActivitySequenceByFeedback = new Map<string, number>();
  const viewerUserId = input.viewerUserId?.trim() || null;
  for (const item of [...input.activityRows].sort((left, right) => left.sequence - right.sequence || left.createdAt.localeCompare(right.createdAt))) {
    const list = activityByFeedback.get(item.feedbackId) ?? [];
    list.push({
      id: item.id,
      actorUserId: item.actorUserId,
      activityType: item.activityType,
      payload: item.payload,
      sequence: item.sequence,
      at: item.createdAt,
    });
    activityByFeedback.set(item.feedbackId, list);
    const currentLastSequence = lastActivitySequenceByFeedback.get(item.feedbackId) ?? 0;
    if (item.sequence >= currentLastSequence) {
      lastActivitySequenceByFeedback.set(item.feedbackId, item.sequence);
      lastActivityActorByFeedback.set(item.feedbackId, item.actorUserId ?? null);
    }
    if (viewerUserId && item.actorUserId !== viewerUserId) {
      lastOtherActivitySequenceByFeedback.set(
        item.feedbackId,
        Math.max(lastOtherActivitySequenceByFeedback.get(item.feedbackId) ?? 0, item.sequence),
      );
    }
  }

  const lastSeenSequenceByFeedback = new Map(input.userViewRows.map((row) => [row.feedbackId, row.lastSeenSequence]));
  const reportAttachmentsByFeedback = new Map<string, Feedback["reportAttachments"]>();
  for (const item of [...input.reportAttachmentRows].sort((left, right) => left.sortOrder - right.sortOrder || left.createdAt.localeCompare(right.createdAt))) {
    const list = reportAttachmentsByFeedback.get(item.feedbackId) ?? [];
    list.push(feedbackReportAttachmentDto(item));
    reportAttachmentsByFeedback.set(item.feedbackId, list);
  }

  const relationsByFeedback = new Map<string, Feedback["relations"]>();
  for (const item of [...input.relationRows].sort((left, right) => left.createdAt.localeCompare(right.createdAt))) {
    const relation = {
      id: item.id,
      type: item.type,
      sourceFeedbackId: item.sourceFeedbackId,
      targetFeedbackId: item.targetFeedbackId,
      createdBy: optional(item.createdBy),
      createdAt: item.createdAt,
    };
    for (const feedbackId of [item.sourceFeedbackId, item.targetFeedbackId]) {
      const list = relationsByFeedback.get(feedbackId) ?? [];
      list.push(relation);
      relationsByFeedback.set(feedbackId, list);
    }
  }

  return input.feedbackRows.map((item) => ({
    id: item.id,
    projectId: item.projectId,
    title: item.title,
    description: item.description,
    reportAttachments: reportAttachmentsByFeedback.get(item.id) ?? [],
    causeCategories: causeCategoriesByFeedback.get(item.id) ?? [],
    impact: item.impact,
    priority: item.priority,
    stage: item.stage,
    resolution: item.resolution,
    assigneeUserId: item.assigneeUserId,
    createdBy: item.createdBy,
    updatedBy: item.updatedBy,
    version: item.version,
    closedAt: item.closedAt,
    closedByUserId: item.closedByUserId,
    lastActivityByUserId: lastActivityActorByFeedback.get(item.id) ?? null,
    lastActivitySequence: lastActivitySequenceByFeedback.get(item.id) ?? 0,
    lastSeenSequence: lastSeenSequenceByFeedback.get(item.id) ?? 0,
    requiresAction: feedbackRequiresAction(item, viewerUserId),
    unread: viewerUserId ? (lastOtherActivitySequenceByFeedback.get(item.id) ?? 0) > (lastSeenSequenceByFeedback.get(item.id) ?? 0) : false,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    activity: activityByFeedback.get(item.id) ?? [],
    relations: relationsByFeedback.get(item.id) ?? [],
  }));
}

export async function getFeedbackIssueReadModelData(scope: FeedbackIssueReadModelScope): Promise<FeedbackIssueReadModelData> {
  const storageScopeId = feedbackReadModelStorageId(scope);
  const [feedbackRows, projectRows, users] = await Promise.all([
    getFeedbackRows(storageScopeId),
    db.select().from(projects).where(eq(projects.teamId, storageScopeId)).orderBy(desc(projects.createdAt), desc(projects.id)),
    getScopedUsers(scope.scope),
  ]);
  const feedbackIds = feedbackRows.map((item) => item.id);
  const [
    causeRows,
    activityRows,
    relationRows,
    reportAttachmentRows,
    userViewRows,
    [commentThreadRows, commentMessageRows, commentAttachmentRows],
  ] = await Promise.all([
    getFeedbackCauseRows(feedbackIds),
    getFeedbackActivityRows(feedbackIds),
    getFeedbackRelationRows(feedbackIds),
    getFeedbackReportAttachmentRows(feedbackIds),
    getFeedbackUserViewRows(storageScopeId, feedbackIds, scope.viewerUserId),
    getFeedbackCommentRows(storageScopeId, feedbackIds),
  ]);

  return {
    comments: await mapCommentThreadRows({
      attachmentRows: commentAttachmentRows,
      messageRows: commentMessageRows,
      threadRows: commentThreadRows,
    }),
    feedback: mapFeedbackIssueRows({
      activityRows,
      causeRows,
      feedbackRows,
      relationRows,
      reportAttachmentRows,
      userViewRows,
      viewerUserId: scope.viewerUserId,
    }),
    projects: mapProjectRows(projectRows),
    users,
  };
}

export async function getFeedbackIssueDetailReadModelData(feedbackId: string, scope: FeedbackIssueReadModelScope): Promise<FeedbackIssueReadModelData | null> {
  const storageScopeId = feedbackReadModelStorageId(scope);
  const [feedbackRows, projectRows, users] = await Promise.all([
    getFeedbackRows(storageScopeId),
    db.select().from(projects).where(eq(projects.teamId, storageScopeId)).orderBy(desc(projects.createdAt), desc(projects.id)),
    getScopedUsers(scope.scope),
  ]);
  if (!feedbackRows.some((item) => item.id === feedbackId)) {
    return null;
  }

  const feedbackIds = feedbackRows.map((item) => item.id);
  const [
    causeRows,
    activityRows,
    relationRows,
    reportAttachmentRows,
    userViewRows,
    [commentThreadRows, commentMessageRows, commentAttachmentRows],
  ] = await Promise.all([
    getFeedbackCauseRows(feedbackIds),
    getFeedbackActivityRows(feedbackIds),
    getFeedbackRelationRows(feedbackIds),
    getFeedbackReportAttachmentRows(feedbackIds),
    getFeedbackUserViewRows(storageScopeId, feedbackIds, scope.viewerUserId),
    getFeedbackCommentRows(storageScopeId, [feedbackId]),
  ]);

  return {
    comments: await mapCommentThreadRows({
      attachmentRows: commentAttachmentRows,
      messageRows: commentMessageRows,
      threadRows: commentThreadRows,
    }),
    feedback: mapFeedbackIssueRows({
      activityRows,
      causeRows,
      feedbackRows,
      relationRows,
      reportAttachmentRows,
      userViewRows,
      viewerUserId: scope.viewerUserId,
    }),
    projects: mapProjectRows(projectRows),
    users,
  };
}

async function getFeedbackCommentRows(
  storageScopeId: string,
  feedbackIds: readonly string[],
): Promise<[CommentThreadRow[], CommentMessageRow[], CommentAttachmentRow[]]> {
  if (feedbackIds.length === 0) return [[], [], []];
  try {
    const threadRows = await db
      .select()
      .from(commentThreads)
      .where(and(eq(commentThreads.teamId, storageScopeId), eq(commentThreads.targetType, "feedback"), inArray(commentThreads.targetId, [...feedbackIds])));
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

async function mapCommentThreadRows(input: {
  attachmentRows: readonly CommentAttachmentRow[];
  messageRows: readonly CommentMessageRow[];
  threadRows: readonly CommentThreadRow[];
}): Promise<CommentThread[]> {
  const commentAuthorAvatarUrls = await getUserAvatarUrlMap(input.messageRows.map((message) => message.authorUserId).filter((userId): userId is string => Boolean(userId)));
  const messagesByThread = new Map<string, CommentThread["messages"]>();
  const attachmentsByMessage = groupCommentAttachmentsByMessage([...input.attachmentRows]);
  for (const message of [...input.messageRows].sort(
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

  return [...input.threadRows]
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
}

function feedbackRequiresAction(item: FeedbackRow, viewerUserId: string | null) {
  if (!viewerUserId) return false;
  if ((item.stage === "open" || item.stage === "in_progress") && item.assigneeUserId === viewerUserId) return true;
  if (item.stage === "pending_verification" && item.createdBy === viewerUserId) return true;
  return false;
}
