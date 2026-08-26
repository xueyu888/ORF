import type { FastifyReply, FastifyRequest } from "fastify";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { registerFeedbackServerModule } from "@orf/feedback-module/server";
import { replaceOrfAttachmentMarkdownTokens } from "../../src/features/rich-text/orfRichTextTokens";
import { buildCommentNotificationContent } from "../notifications/notificationEventModel";
import { requireUserScopeContext } from "../auth/accessPolicy";
import { db } from "../db/client";
import {
  commentAttachments,
  commentMessages,
  commentThreads,
  projects,
} from "../db/schema";
import { env } from "../env";
import {
  deleteStoredCommentAttachmentObjects,
  groupCommentAttachmentsByMessage,
  prepareCommentAttachmentStream,
  type PreparedCommentAttachment,
} from "../repositories/commentAttachmentRepository";
import {
  getActiveAdminNotificationRecipients,
  getActiveMemberNotificationRecipientsByIds,
} from "../repositories/notificationRepository";
import { runtimeScope, runtimeScopeStorageId } from "../repositories/runtimeScope";
import { getScopedUsers } from "../repositories/userRepository";
import { publishOrfDataInvalidation } from "../realtime/orfReadModelInvalidations";
import { objectStorage } from "../storage/objectStorage";
import { readFeedbackSettings } from "../settings/feedbackSettings";
import { getUserAvatarUrlMap } from "../users/avatar/avatarRepository";
import { feedbackNotificationPort } from "./feedbackNotificationPort";
import { resolveUnitOfWork } from "../db/unitOfWork";
import { commitFeedbackFollowUp } from "../repositories/orfRepository";

type FeedbackRequiredPorts = Parameters<typeof registerFeedbackServerModule>[0]["ports"];
type FeedbackScope = { readonly storageScopeId: string };
type FeedbackReportAttachmentPort = FeedbackRequiredPorts["reportAttachments"];
type FeedbackPreparedReportAttachment = {
  readonly fileName: string;
  readonly fileSize: number;
  readonly height?: number | null;
  readonly id: string;
  readonly markdown: string;
  readonly mimeType: string;
  readonly objectKey: string;
  readonly width?: number | null;
};

type CommentThreadRow = typeof commentThreads.$inferSelect;
type CommentMessageRow = typeof commentMessages.$inferSelect;
type CommentAttachmentRow = typeof commentAttachments.$inferSelect;

export function createOrfFeedbackPorts(input: {
  readonly dailyDigest: FeedbackRequiredPorts["dailyDigest"];
  readonly log: FeedbackRequiredPorts["log"];
  readonly startBackgroundJobs: boolean;
}): FeedbackRequiredPorts {
  return {
    actor: {
      async requireUserScopeContext(request, reply) {
        const context = await requireUserScopeContext(request as FastifyRequest, reply as FastifyReply);
        if (!context) return null;
        return {
          scope: feedbackScopeFromRuntimeScope(context.scope),
          user: {
            avatarUrl: context.user.avatarUrl ?? null,
            email: context.user.email,
            id: context.user.id,
            name: context.user.name,
            role: context.user.role,
            status: context.user.status,
          },
        };
      },
    },
    backgroundJobs: {
      enabled: input.startBackgroundJobs,
    },
    database: db,
    dailyDigest: input.dailyDigest,
    discussion: feedbackDiscussionPort,
    limits: {
      async readReportAttachmentMaxBytes() {
        return (await readFeedbackSettings()).attachmentMaxBytes;
      },
      uploadMaxBytes: env.OBJECT_STORAGE_UPLOAD_MAX_BYTES,
    },
    log: input.log,
    notificationContent: {
      buildCommentContent(input) {
        return buildCommentNotificationContent(input as Parameters<typeof buildCommentNotificationContent>[0]);
      },
    },
    notificationDispatch: {
      publish: feedbackNotificationPort,
    },
    objectStorage: {
      getObject(objectKey, options) {
        return objectStorage.getObject(objectKey, options);
      },
    },
    projectDirectory: {
      async getById(scope, projectId) {
        const normalizedProjectId = projectId.trim();
        if (!normalizedProjectId) return null;
        const [project] = await db
          .select({ id: projects.id, name: projects.name })
          .from(projects)
          .where(and(eq(projects.id, normalizedProjectId), eq(projects.teamId, scope.storageScopeId)))
          .limit(1);
        return project ?? null;
      },
      async list(scope) {
        return db
          .select({
            createdAt: projects.createdAt,
            id: projects.id,
            name: projects.name,
            updatedAt: projects.updatedAt,
          })
          .from(projects)
          .where(eq(projects.teamId, scope.storageScopeId))
          .orderBy(desc(projects.createdAt), desc(projects.id));
      },
    },
    realtime: {
      publishFeedbackChanged(event) {
        publishOrfDataInvalidation({
          actorUserId: event.actorUserId ?? undefined,
          models: ["feedback"],
          reason: "feedback.changed",
          target: event.feedbackId ? { id: event.feedbackId, type: "feedback" } : undefined,
          teamId: event.scope.storageScopeId,
        });
      },
    },
    reportAttachments: feedbackReportAttachmentPort,
    unitOfWork: {
      async use(token, operation) {
        return operation(resolveUnitOfWork(token));
      },
    },
    userDirectory: {
      getActiveAdminUserIds(scope) {
        return getActiveAdminNotificationRecipients(scope.storageScopeId);
      },
      getActiveMemberUserIdsByIds(scope, userIds) {
        return getActiveMemberNotificationRecipientsByIds(scope.storageScopeId, [...userIds]);
      },
      async getActiveMemberById(scope, userId) {
        const normalizedUserId = userId.trim();
        if (!normalizedUserId) return null;
        const users = await getScopedUsers(runtimeScope(scope.storageScopeId));
        const member = users.find((user) => user.status === "active" && user.id === normalizedUserId);
        return member ? { id: member.id, name: member.name } : null;
      },
      listScopedUsers(scope) {
        return getScopedUsers(runtimeScope(scope.storageScopeId));
      },
    },
  };
}

const feedbackDiscussionPort: FeedbackRequiredPorts["discussion"] = {
  async commitFollowUp(input, commit) {
    const result = await commitFeedbackFollowUp({
      body: input.body ?? "",
      parentMessageId: input.parentMessageId,
      replyToMessageId: input.replyToMessageId,
      targetId: input.feedbackId,
      targetTitle: input.title,
      targetType: "feedback",
    }, {
      id: input.actor.id,
      name: input.actor.name,
      role: input.actor.role,
      scope: runtimeScope(input.actor.scope.storageScopeId),
    }, commit);
    return result.status === "ok" ? { status: "ok", changed: true } : result;
  },
  async getCommentSummaries(scope, feedbackIds) {
    if (feedbackIds.length === 0) return [];
    const rows = await db
      .select({
        commentCount: sql<number>`count(${commentMessages.id})::int`,
        feedbackId: commentThreads.targetId,
        updatedAt: sql<string | null>`max(${commentThreads.updatedAt})`,
      })
      .from(commentThreads)
      .leftJoin(commentMessages, eq(commentMessages.threadId, commentThreads.id))
      .where(and(eq(commentThreads.teamId, scope.storageScopeId), eq(commentThreads.targetType, "feedback"), inArray(commentThreads.targetId, [...feedbackIds])))
      .groupBy(commentThreads.targetId);

    return rows.map((row) => ({
      commentCount: Number(row.commentCount) || 0,
      feedbackId: row.feedbackId,
      updatedAt: row.updatedAt ?? null,
    }));
  },
  async getThreads(scope, feedbackIds) {
    const [threadRows, messageRows, attachmentRows] = await getFeedbackCommentRows(scope.storageScopeId, feedbackIds);
    return mapCommentThreadRows({
      attachmentRows,
      messageRows,
      threadRows,
    });
  },
  async syncTargetTitle(input, database) {
    const client = database as Pick<NodePgDatabase<any>, "update">;
    await client
      .update(commentThreads)
      .set({ targetTitle: input.title, updatedAt: input.updatedAt })
      .where(and(
        eq(commentThreads.teamId, input.scope.storageScopeId),
        eq(commentThreads.targetType, "feedback"),
        eq(commentThreads.targetId, input.feedbackId),
      ));
  },
};

const feedbackReportAttachmentPort: FeedbackReportAttachmentPort = {
  deletePrepared(attachments) {
    return deleteStoredCommentAttachmentObjects(attachments.map((attachment) => ({ objectKey: attachment.objectKey })));
  },
  async prepareReport(input) {
    const preparedUploads: Array<{ clientId: string; prepared: PreparedCommentAttachment }> = [];
    let remainingBytes = input.uploadMaxBytes;
    for (const attachment of input.attachments) {
      const prepared = await prepareCommentAttachmentStream({
        body: attachment.body,
        createdAt: input.createdAt,
        createdBy: input.actorUserId,
        fileName: attachment.fileName,
        maxBytes: remainingBytes,
        messageId: null,
        mimeType: attachment.mimeType,
        storageScopeId: input.scope.storageScopeId,
        targetId: input.feedbackId,
        targetType: "feedback",
      });
      if (prepared.status !== "ok") {
        await deleteStoredCommentAttachmentObjects(preparedUploads.map((upload) => upload.prepared.row));
        return { status: prepared.status };
      }
      remainingBytes -= prepared.prepared.row.fileSize;
      preparedUploads.push({ clientId: attachment.clientId, prepared: prepared.prepared });
    }

    const report = buildReportDescription({ description: input.description, uploads: preparedUploads });
    if (report.status !== "ok") {
      await deleteStoredCommentAttachmentObjects(preparedUploads.map((upload) => upload.prepared.row));
      return { status: "invalid" };
    }

    return {
      status: "ok",
      report: {
        description: report.description,
        attachments: preparedUploads.map((upload): FeedbackPreparedReportAttachment => ({
          fileName: upload.prepared.row.fileName,
          fileSize: upload.prepared.row.fileSize,
          height: upload.prepared.row.height ?? null,
          id: upload.prepared.row.id,
          markdown: upload.prepared.markdown,
          mimeType: upload.prepared.row.mimeType,
          objectKey: upload.prepared.row.objectKey,
          width: upload.prepared.row.width ?? null,
        })),
      },
    };
  },
};

function feedbackScopeFromRuntimeScope(scope: Parameters<typeof runtimeScopeStorageId>[0]): FeedbackScope {
  return { storageScopeId: runtimeScopeStorageId(scope) };
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
    if (isMissingCommentStorageError(error)) return [[], [], []];
    throw error;
  }
}

async function mapCommentThreadRows(input: {
  readonly attachmentRows: readonly CommentAttachmentRow[];
  readonly messageRows: readonly CommentMessageRow[];
  readonly threadRows: readonly CommentThreadRow[];
}) {
  const commentAuthorAvatarUrls = await getUserAvatarUrlMap(input.messageRows.map((message) => message.authorUserId).filter((userId): userId is string => Boolean(userId)));
  const messagesByThread = new Map<string, NonNullable<Awaited<ReturnType<FeedbackRequiredPorts["discussion"]["getThreads"]>>>[number]["messages"]>();
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
      createdBy: thread.createdBy ?? undefined,
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt,
      messages: messagesByThread.get(thread.id) ?? [],
    }));
}

function buildReportDescription(input: { description: string; uploads: Array<{ clientId: string; prepared: PreparedCommentAttachment }> }) {
  const uploadsByClientId = new Map(input.uploads.map((upload) => [upload.clientId, upload.prepared]));
  const usedClientIds = new Set<string>();
  const missingClientIds = new Set<string>();
  const replaced = replaceOrfAttachmentMarkdownTokens(input.description, (reference, token) => {
    if (reference.kind !== "pending") return token;
    const upload = uploadsByClientId.get(reference.pendingAttachmentId);
    if (!upload) {
      missingClientIds.add(reference.pendingAttachmentId);
      return "";
    }

    usedClientIds.add(reference.pendingAttachmentId);
    return upload.markdown;
  });
  if (missingClientIds.size > 0) return { status: "invalid" as const };

  const unreferencedMarkdown = input.uploads
    .filter((upload) => !usedClientIds.has(upload.clientId))
    .map((upload) => upload.prepared.markdown);
  const description = [replaced.trim(), ...unreferencedMarkdown].filter(Boolean).join("\n\n").trim();
  return description ? { status: "ok" as const, description } : { status: "invalid" as const };
}

function isMissingCommentStorageError(error: unknown) {
  const cause = error && typeof error === "object" && "cause" in error ? (error as { cause?: unknown }).cause : error;
  if (!cause || typeof cause !== "object" || !("code" in cause)) return false;
  return cause.code === "42P01" || cause.code === "42704";
}

function optional<T>(value: T | null | undefined): T | undefined {
  return value ?? undefined;
}
