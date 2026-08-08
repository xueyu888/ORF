import { and, eq, inArray } from "drizzle-orm";
import {
  buildFeedbackBackupZip,
  listFeedbackReportAttachmentObjectRefs,
  type FeedbackBackupAttachmentFile,
  type FeedbackReportAttachmentObjectRef,
} from "@orf/feedback-module/server";
import type { FeedbackIssueReadModelData } from "@orf/feedback-module/contracts";
import { db } from "../db/client";
import { commentAttachments } from "../db/schema";
import { getFeedbackIssueTransferReadModelData } from "../readModels/feedbackIssueReadModel";
import { runtimeScopeStorageId, type RuntimeScope } from "../repositories/runtimeScope";
import { objectStorage, type ObjectStorage } from "../storage/objectStorage";

export class FeedbackBackupAttachmentUnavailableError extends Error {
  constructor(readonly attachmentId: string, readonly objectKey: string) {
    super("feedback backup attachment object is unavailable");
    this.name = "FeedbackBackupAttachmentUnavailableError";
  }
}

export async function buildFeedbackBackupZipForScope(input: {
  exportedAt: string;
  scope: RuntimeScope;
}) {
  const teamId = runtimeScopeStorageId(input.scope);
  const data = await getFeedbackIssueTransferReadModelData({ scope: input.scope });
  const attachmentFiles = await collectFeedbackBackupAttachmentFiles({
    data,
    storage: objectStorage,
    teamId,
  });
  return buildFeedbackBackupZip({
    attachmentFiles,
    data,
    exportedAt: input.exportedAt,
  });
}

async function collectFeedbackBackupAttachmentFiles(input: {
  data: FeedbackIssueReadModelData;
  storage: ObjectStorage;
  teamId: string;
}): Promise<FeedbackBackupAttachmentFile[]> {
  const [reportRows, commentRows] = await Promise.all([
    getFeedbackBackupReportAttachmentRows(input),
    getFeedbackBackupCommentAttachmentRows(input),
  ]);
  const threadIdByMessageId = commentThreadIdByMessageId(input.data);

  const reportFiles = await Promise.all(
    [...reportRows].sort(compareReportAttachmentRows).map(async (row): Promise<FeedbackBackupAttachmentFile> => ({
      attachmentId: row.id,
      content: await readBackupAttachmentObject(input.storage, row.id, row.objectKey),
      feedbackId: row.feedbackId,
      fileName: row.fileName,
      fileSize: row.fileSize,
      kind: "report",
      mimeType: row.mimeType,
    })),
  );
  const commentFiles = await Promise.all(
    [...commentRows].sort(compareCommentAttachmentRows).map(async (row): Promise<FeedbackBackupAttachmentFile> => ({
      attachmentId: row.id,
      content: await readBackupAttachmentObject(input.storage, row.id, row.objectKey),
      feedbackId: row.targetId,
      fileName: row.fileName,
      fileSize: row.fileSize,
      kind: "comment",
      messageId: row.messageId,
      mimeType: row.mimeType,
      threadId: threadIdByMessageId.get(row.messageId ?? "") ?? null,
    })),
  );

  return [...reportFiles, ...commentFiles];
}

async function getFeedbackBackupReportAttachmentRows(input: {
  data: FeedbackIssueReadModelData;
  teamId: string;
}) {
  const attachmentIds = input.data.feedback.flatMap((item) => item.reportAttachments.map((attachment) => attachment.id));
  return listFeedbackReportAttachmentObjectRefs(db, {
    attachmentIds,
    teamId: input.teamId,
  });
}

async function getFeedbackBackupCommentAttachmentRows(input: {
  data: FeedbackIssueReadModelData;
  teamId: string;
}) {
  const attachmentIds = input.data.comments.flatMap((thread) =>
    thread.messages.flatMap((message) => (message.attachments ?? []).map((attachment) => attachment.id)),
  );
  if (attachmentIds.length === 0) return [];
  return db
    .select()
    .from(commentAttachments)
    .where(and(
      eq(commentAttachments.teamId, input.teamId),
      eq(commentAttachments.targetType, "feedback"),
      inArray(commentAttachments.id, [...new Set(attachmentIds)]),
    ));
}

async function readBackupAttachmentObject(storage: ObjectStorage, attachmentId: string, objectKey: string) {
  const stored = await storage.getObject(objectKey);
  if (!stored) {
    throw new FeedbackBackupAttachmentUnavailableError(attachmentId, objectKey);
  }

  const chunks: Buffer[] = [];
  for await (const chunk of stored.body) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
  }
  return Buffer.concat(chunks);
}

function commentThreadIdByMessageId(data: FeedbackIssueReadModelData) {
  const index = new Map<string, string>();
  for (const thread of data.comments) {
    for (const message of thread.messages) {
      index.set(message.id, thread.id);
    }
  }
  return index;
}

function compareReportAttachmentRows(
  left: FeedbackReportAttachmentObjectRef,
  right: FeedbackReportAttachmentObjectRef,
) {
  return left.feedbackId.localeCompare(right.feedbackId) ||
    left.sortOrder - right.sortOrder ||
    left.id.localeCompare(right.id);
}

function compareCommentAttachmentRows(
  left: typeof commentAttachments.$inferSelect,
  right: typeof commentAttachments.$inferSelect,
) {
  return (left.targetId ?? "").localeCompare(right.targetId ?? "") ||
    (left.messageId ?? "").localeCompare(right.messageId ?? "") ||
    left.id.localeCompare(right.id);
}
