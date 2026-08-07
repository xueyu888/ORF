import { and, desc, eq, inArray } from "drizzle-orm";
import { getFeedbackReadModelIssues, type FeedbackReadModelViewer } from "@orf/feedback-module/server";
import type { FeedbackIssueReadModelData } from "../../src/domain/feedbackReadModel";
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

export function mapProjectRows(projectRows: readonly ProjectRow[]): OrfProject[] {
  return projectRows.map((project) => ({
    id: project.id,
    name: project.name,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  }));
}

export async function getFeedbackIssueReadModelData(scope: FeedbackIssueReadModelScope): Promise<FeedbackIssueReadModelData> {
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

export async function getFeedbackIssueDetailReadModelData(feedbackId: string, scope: FeedbackIssueReadModelScope): Promise<FeedbackIssueReadModelData | null> {
  const storageScopeId = feedbackReadModelStorageId(scope);
  const [projectRows, users] = await Promise.all([
    db.select().from(projects).where(eq(projects.teamId, storageScopeId)).orderBy(desc(projects.createdAt), desc(projects.id)),
    getScopedUsers(scope.scope),
  ]);
  const feedback = await getFeedbackReadModelIssues(db, {
    teamId: storageScopeId,
    viewer: feedbackReadModelViewer(users, scope.viewerUserId),
  });
  if (!feedback.some((item) => item.id === feedbackId)) {
    return null;
  }

  const [commentThreadRows, commentMessageRows, commentAttachmentRows] = await getFeedbackCommentRows(storageScopeId, [feedbackId]);

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
