import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  getFeedbackReadModelIssue,
  getFeedbackReadModelIssues,
  getFeedbackReadModelListPage,
  type FeedbackReadModelViewer,
} from "@orf/feedback-module/server";
import {
  buildFeedbackIssueListProjection,
  defaultFeedbackIssueListFilters,
  type FeedbackIssueListFilters,
  type FeedbackIssueListPagination,
} from "@orf/feedback-module/contracts";
import type {
  FeedbackIssueListCommentSummary,
  FeedbackIssueReadModelData,
  FeedbackWebCommentThread,
  FeedbackWebProject,
} from "@orf/feedback-module/contracts";
import type { CommentThread, OrfProject, OrfUser } from "../../src/types/orf";
import { db } from "../db/client";
import {
  commentAttachments,
  commentMessages,
  commentThreads,
  projects,
} from "../db/schema";
import { groupCommentAttachmentsByMessage } from "../repositories/commentAttachmentRepository";
import { runtimeScopeStorageId, type RuntimeScope } from "../repositories/runtimeScope";
import { getScopedUsers } from "../repositories/userRepository";
import { getUserAvatarUrlMap } from "../users/avatar/avatarRepository";
import { optional } from "./orfReadModelMappers";

export type FeedbackIssueReadModelScope = {
  filters?: FeedbackIssueListFilters;
  pagination?: FeedbackIssueListPagination | null;
  scope: RuntimeScope;
  viewerUserId?: string | null;
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

export function mapProjectRows(projectRows: readonly ProjectRow[]): FeedbackWebProject[] {
  return projectRows.map((project) => ({
    id: project.id,
    name: project.name,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  }));
}

export async function getFeedbackIssueListReadModelData(scope: FeedbackIssueReadModelScope): Promise<FeedbackIssueReadModelData> {
  const storageScopeId = feedbackReadModelStorageId(scope);
  const [projectRows, users] = await Promise.all([
    db.select().from(projects).where(eq(projects.teamId, storageScopeId)).orderBy(desc(projects.createdAt), desc(projects.id)),
    getScopedUsers(scope.scope),
  ]);
  const filters = scope.filters ?? defaultFeedbackIssueListFilters;
  const listPage = await getFeedbackReadModelListPage(db, {
    filters,
    pagination: scope.pagination ?? null,
    teamId: storageScopeId,
    viewer: feedbackReadModelViewer(users, scope.viewerUserId),
  });
  const projectModels = mapProjectRows(projectRows);
  const commentSummaries = await getFeedbackCommentSummaries(
    storageScopeId,
    listPage.issues.map((item) => item.id),
  );
  const list = buildFeedbackIssueListProjection({
    commentSummaries,
    feedback: listPage.issues,
    filters,
    projectionFacts: {
      assigneeOptions: feedbackListUserOptions(listPage.facts.optionFacts.assigneeUserIds, users),
      authorOptions: feedbackListUserOptions(listPage.facts.optionFacts.authorUserIds, users),
      counts: listPage.facts.counts,
      labelOptions: listPage.facts.optionFacts.labelOptions,
      matchedCount: listPage.facts.matchedCount,
      pageInfo: listPage.facts.pageInfo,
      totalCount: listPage.facts.totalCount,
    },
    projects: projectModels,
    users,
  });

  return {
    comments: [],
    feedback: list.items.map((item) => item.feedback),
    list,
    projects: projectModels,
    users,
  };
}

function feedbackListUserOptions(userIds: readonly string[], users: readonly OrfUser[]) {
  const userById = new Map(users.map((user) => [user.id, user]));
  return userIds
    .map((userId) => ({
      label: userById.get(userId)?.name ?? userId,
      value: userId,
    }))
    .sort((left, right) => left.label.localeCompare(right.label, "zh-Hans-CN"));
}

async function getFeedbackIssueReadModelDataForScope(
  scope: FeedbackIssueReadModelScope,
): Promise<FeedbackIssueReadModelData> {
  const storageScopeId = feedbackReadModelStorageId(scope);
  const [projectRows, users] = await Promise.all([
    db.select().from(projects).where(eq(projects.teamId, storageScopeId)).orderBy(desc(projects.createdAt), desc(projects.id)),
    getScopedUsers(scope.scope),
  ]);
  const feedback = await getFeedbackReadModelIssues(db, {
    teamId: storageScopeId,
    viewer: feedbackReadModelViewer(users, scope.viewerUserId),
  });
  const [commentThreadRows, commentMessageRows, commentAttachmentRows] = await getFeedbackCommentRows(
    storageScopeId,
    feedback.map((item) => item.id),
  );

  return {
    comments: await mapCommentThreadRows({
      attachmentRows: commentAttachmentRows,
      messageRows: commentMessageRows,
      threadRows: commentThreadRows,
    }),
    feedback,
    projects: mapProjectRows(projectRows),
    users,
  };
}

async function getFeedbackCommentSummaries(
  storageScopeId: string,
  feedbackIds: readonly string[],
): Promise<FeedbackIssueListCommentSummary[]> {
  if (feedbackIds.length === 0) return [];
  const rows = await db
    .select({
      commentCount: sql<number>`count(${commentMessages.id})::int`,
      feedbackId: commentThreads.targetId,
      updatedAt: sql<string | null>`max(${commentThreads.updatedAt})`,
    })
    .from(commentThreads)
    .leftJoin(commentMessages, eq(commentMessages.threadId, commentThreads.id))
    .where(and(eq(commentThreads.teamId, storageScopeId), eq(commentThreads.targetType, "feedback"), inArray(commentThreads.targetId, [...feedbackIds])))
    .groupBy(commentThreads.targetId);

  return rows.map((row) => ({
    commentCount: Number(row.commentCount) || 0,
    feedbackId: row.feedbackId,
    updatedAt: row.updatedAt ?? null,
  }));
}

export async function getFeedbackIssueTransferReadModelData(scope: Pick<FeedbackIssueReadModelScope, "scope">): Promise<FeedbackIssueReadModelData> {
  return getFeedbackIssueReadModelDataForScope({ scope: scope.scope, viewerUserId: null });
}

export async function getFeedbackIssueDetailReadModelData(feedbackId: string, scope: FeedbackIssueReadModelScope): Promise<FeedbackIssueReadModelData | null> {
  const storageScopeId = feedbackReadModelStorageId(scope);
  const [projectRows, users] = await Promise.all([
    db.select().from(projects).where(eq(projects.teamId, storageScopeId)).orderBy(desc(projects.createdAt), desc(projects.id)),
    getScopedUsers(scope.scope),
  ]);
  const feedback = await getFeedbackReadModelIssue(db, {
    feedbackId,
    teamId: storageScopeId,
    viewer: feedbackReadModelViewer(users, scope.viewerUserId),
  });
  if (!feedback) {
    return null;
  }

  const [commentThreadRows, commentMessageRows, commentAttachmentRows] = await getFeedbackCommentRows(storageScopeId, [feedbackId]);

  return {
    comments: await mapCommentThreadRows({
      attachmentRows: commentAttachmentRows,
      messageRows: commentMessageRows,
      threadRows: commentThreadRows,
    }),
    feedback: [feedback],
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
}): Promise<FeedbackWebCommentThread[]> {
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

function feedbackReadModelViewer(users: readonly OrfUser[], viewerUserId: string | null | undefined): FeedbackReadModelViewer | null {
  const normalizedViewerUserId = viewerUserId?.trim();
  if (!normalizedViewerUserId) return null;
  const user = users.find((item) => item.id === normalizedViewerUserId);
  return user ? {
    id: user.id,
    role: user.role,
    status: user.status === "active" ? "active" : "inactive",
  } : null;
}
