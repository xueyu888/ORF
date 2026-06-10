import { randomUUID } from "node:crypto";
import type { CommentAttachment, CommentTargetType } from "../../src/types/orf";
import { commentAttachments } from "../db/schema";
import { objectStorage } from "../storage/objectStorage";
import { validateImageUpload } from "../storage/images";

export type CommentAttachmentRow = typeof commentAttachments.$inferSelect;
export type CommentAttachmentInsert = typeof commentAttachments.$inferInsert;

export type PreparedCommentAttachment = {
  attachment: CommentAttachment;
  markdown: string;
  row: CommentAttachmentInsert;
};

export type PrepareCommentAttachmentOutcome =
  | { status: "ok"; prepared: PreparedCommentAttachment }
  | { status: "invalid" }
  | { status: "tooLarge" }
  | { status: "unsupported" };

let attachmentIdCounter = 0;

function nextAttachmentIdCounter() {
  attachmentIdCounter = (attachmentIdCounter + 1) % Number.MAX_SAFE_INTEGER;
  return attachmentIdCounter.toString(36);
}

function makeCommentAttachmentId() {
  return `catt_${Date.now()}_${nextAttachmentIdCounter()}_${randomUUID()}`;
}

function commentAttachmentContentUrl(id: string) {
  return `/api/comments/attachments/${encodeURIComponent(id)}/content`;
}

export function commentAttachmentDto(row: CommentAttachmentRow | CommentAttachmentInsert): CommentAttachment {
  return {
    id: row.id,
    fileName: row.fileName,
    mimeType: row.mimeType,
    fileSize: row.fileSize,
    width: row.width ?? undefined,
    height: row.height ?? undefined,
    contentUrl: commentAttachmentContentUrl(row.id),
  };
}

export function groupCommentAttachmentsByMessage(rows: CommentAttachmentRow[]) {
  const grouped = new Map<string, CommentAttachment[]>();
  for (const row of rows) {
    if (!row.messageId) continue;
    const attachments = grouped.get(row.messageId) ?? [];
    attachments.push(commentAttachmentDto(row));
    grouped.set(row.messageId, attachments);
  }
  return grouped;
}

export async function deleteStoredCommentAttachmentObjects(rows: Array<Pick<CommentAttachmentRow | CommentAttachmentInsert, "objectKey">>) {
  await Promise.allSettled(rows.map((row) => objectStorage.deleteObject(row.objectKey)));
}

function sanitizeFileName(fileName: string, extension: string) {
  const leafName = fileName.split(/[\\/]/).pop()?.trim() ?? "";
  const sanitized = leafName.replace(/[^\w.\-()\u4e00-\u9fff ]+/g, "_").slice(0, 120).trim();
  return sanitized || `image.${extension}`;
}

function commentAttachmentObjectKey(input: {
  attachmentId: string;
  extension: string;
  storageScopeId: string;
  targetId: string;
  targetType: CommentTargetType;
}) {
  const safeTargetId = input.targetId.replace(/[^A-Za-z0-9_-]+/g, "_");
  const now = new Date();
  const year = now.getUTCFullYear().toString();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `comments/${input.storageScopeId}/${input.targetType}/${safeTargetId}/${year}/${month}/${input.attachmentId}.${input.extension}`;
}

export function pendingCommentAttachmentExpiresAt(createdAt: string) {
  return new Date(new Date(createdAt).getTime() + 24 * 60 * 60 * 1000).toISOString();
}

export async function prepareCommentAttachment(input: {
  body: Buffer;
  createdAt: string;
  createdBy: string;
  fileName: string;
  messageId: string | null;
  mimeType: string;
  storageScopeId: string;
  targetId: string;
  targetType: CommentTargetType;
}): Promise<PrepareCommentAttachmentOutcome> {
  if (!input.body.byteLength || !input.fileName.trim()) {
    return { status: "invalid" };
  }

  const validation = validateImageUpload({ buffer: input.body, contentType: input.mimeType });
  if (validation.status !== "ok") {
    return { status: validation.status };
  }

  const attachmentId = makeCommentAttachmentId();
  const objectKey = commentAttachmentObjectKey({
    attachmentId,
    extension: validation.metadata.extension,
    storageScopeId: input.storageScopeId,
    targetId: input.targetId,
    targetType: input.targetType,
  });
  const fileName = sanitizeFileName(input.fileName, validation.metadata.extension);
  const attachedAt = input.messageId ? input.createdAt : null;
  const expiresAt = pendingCommentAttachmentExpiresAt(input.createdAt);

  await objectStorage.putObject({
    body: input.body,
    contentLength: input.body.byteLength,
    contentType: validation.metadata.mimeType,
    key: objectKey,
  });

  const row: CommentAttachmentInsert = {
    id: attachmentId,
    teamId: input.storageScopeId,
    targetType: input.targetType,
    targetId: input.targetId,
    messageId: input.messageId,
    objectKey,
    fileName,
    mimeType: validation.metadata.mimeType,
    fileSize: input.body.byteLength,
    width: validation.metadata.width ?? null,
    height: validation.metadata.height ?? null,
    createdBy: input.createdBy,
    createdAt: input.createdAt,
    attachedAt,
    expiresAt,
  };

  return {
    status: "ok",
    prepared: {
      attachment: commentAttachmentDto(row),
      markdown: `![${fileName}](orf-attachment:${attachmentId})`,
      row,
    },
  };
}
