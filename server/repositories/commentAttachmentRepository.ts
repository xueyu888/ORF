import { randomUUID } from "node:crypto";
import type { Readable } from "node:stream";
import type { CommentAttachment, CommentAttachmentPreviewKind, CommentTargetType } from "../../src/types/orf";
import { commentAttachments } from "../db/schema";
import {
  ObjectStorageUploadEmptyError,
  ObjectStorageUploadTooLargeError,
  objectStorage,
} from "../storage/objectStorage";
import { readImageMetadata } from "../storage/images";

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
  | { status: "tooLarge" };

export type CommentAttachmentUploadMetadata = {
  extension: string;
  height?: number;
  mimeType: string;
  width?: number;
};

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

function commentAttachmentDownloadUrl(id: string) {
  return `/api/comments/attachments/${encodeURIComponent(id)}/content?disposition=attachment`;
}

function commentAttachmentPreviewUrl(id: string) {
  return `/api/comments/attachments/${encodeURIComponent(id)}/content?disposition=inline`;
}

function normalizeMimeType(value: string) {
  return value.split(";")[0]?.trim().toLowerCase() ?? "";
}

const previewableTextFileExtensions = new Set(["csv", "json", "log", "txt"]);
const previewableTextMimeTypes = new Set(["application/json", "text/csv", "text/plain"]);
const unsafeTextPreviewFileExtensions = new Set(["htm", "html", "svg", "xhtml", "xml"]);

export function commentAttachmentPreviewKind(row: Pick<CommentAttachmentRow | CommentAttachmentInsert, "fileName" | "mimeType">): CommentAttachmentPreviewKind {
  const mimeType = normalizeMimeType(row.mimeType);
  const fileName = row.fileName.toLowerCase();
  const extension = extensionFromFileName(fileName);
  if (mimeType === "image/gif" || mimeType === "image/jpeg" || mimeType === "image/png" || mimeType === "image/webp") return "image";
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType === "text/markdown" || fileName.endsWith(".md") || fileName.endsWith(".markdown")) return "markdown";
  if (previewableTextFileExtensions.has(extension) || (previewableTextMimeTypes.has(mimeType) && !unsafeTextPreviewFileExtensions.has(extension))) return "text";
  return "download";
}

export function canPreviewCommentAttachment(row: Pick<CommentAttachmentRow | CommentAttachmentInsert, "fileName" | "mimeType">) {
  return commentAttachmentPreviewKind(row) !== "download";
}

export function commentAttachmentDto(row: CommentAttachmentRow | CommentAttachmentInsert): CommentAttachment {
  const previewKind = commentAttachmentPreviewKind(row);
  return {
    contentUrl: commentAttachmentContentUrl(row.id),
    downloadUrl: commentAttachmentDownloadUrl(row.id),
    id: row.id,
    fileName: row.fileName,
    mimeType: row.mimeType,
    fileSize: row.fileSize,
    previewKind,
    previewUrl: previewKind === "download" ? undefined : commentAttachmentPreviewUrl(row.id),
    width: row.width ?? undefined,
    height: row.height ?? undefined,
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

export function sanitizeCommentAttachmentFileName(fileName: string, extension: string) {
  const leafName = fileName.split(/[\\/]/).pop()?.trim() ?? "";
  const sanitized = leafName.replace(/[^\w.\-()\u4e00-\u9fff ]+/g, "_").slice(0, 120).trim();
  return sanitized || `attachment.${extension}`;
}

function extensionFromFileName(fileName: string) {
  const leafName = fileName.split(/[\\/]/).pop()?.trim() ?? "";
  const match = /\.([A-Za-z0-9]{1,16})$/.exec(leafName);
  return match?.[1]?.toLowerCase() ?? "";
}

function extensionFromMimeType(mimeType: string) {
  const normalized = normalizeMimeType(mimeType);
  if (normalized === "application/json") return "json";
  if (normalized === "application/pdf") return "pdf";
  if (normalized === "text/csv") return "csv";
  if (normalized === "text/markdown") return "md";
  if (normalized === "text/plain") return "txt";
  return "bin";
}

function isPdf(buffer: Buffer) {
  return buffer.length >= 5 && buffer.subarray(0, 5).toString("ascii") === "%PDF-";
}

function isMarkdownFile(input: { fileName: string; mimeType: string }) {
  const extension = extensionFromFileName(input.fileName);
  const mimeType = normalizeMimeType(input.mimeType);
  return extension === "md" || extension === "markdown" || mimeType === "text/markdown";
}

function isPreviewableTextFile(input: { fileName: string; mimeType: string }) {
  const extension = extensionFromFileName(input.fileName);
  const mimeType = normalizeMimeType(input.mimeType);
  return previewableTextFileExtensions.has(extension) || (previewableTextMimeTypes.has(mimeType) && !unsafeTextPreviewFileExtensions.has(extension));
}

export function safeCommentAttachmentMetadata(input: { body: Buffer; fileName: string; mimeType: string }): CommentAttachmentUploadMetadata {
  const declaredMimeType = normalizeMimeType(input.mimeType);
  const imageMetadata = readImageMetadata(input.body);
  if (imageMetadata) {
    return {
      extension: imageMetadata.extension,
      height: imageMetadata.height,
      mimeType: imageMetadata.mimeType,
      width: imageMetadata.width,
    };
  }

  if (isPdf(input.body)) {
    return { extension: "pdf", mimeType: "application/pdf" };
  }

  if (isMarkdownFile(input)) {
    return { extension: extensionFromFileName(input.fileName) || "md", mimeType: "text/markdown; charset=utf-8" };
  }

  if (isPreviewableTextFile(input)) {
    return { extension: extensionFromFileName(input.fileName) || extensionFromMimeType(declaredMimeType), mimeType: "text/plain; charset=utf-8" };
  }

  if (declaredMimeType.startsWith("image/") || declaredMimeType === "application/pdf") {
    return {
      extension: extensionFromFileName(input.fileName) || extensionFromMimeType(declaredMimeType),
      mimeType: "application/octet-stream",
    };
  }

  return {
    extension: extensionFromFileName(input.fileName) || extensionFromMimeType(declaredMimeType),
    mimeType: declaredMimeType || "application/octet-stream",
  };
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

export async function prepareCommentAttachmentStream(input: {
  body: Readable;
  createdAt: string;
  createdBy: string;
  fileName: string;
  maxBytes: number;
  messageId: string | null;
  mimeType: string;
  storageScopeId: string;
  targetId: string;
  targetType: CommentTargetType;
}): Promise<PrepareCommentAttachmentOutcome> {
  if (!input.fileName.trim()) {
    return { status: "invalid" };
  }

  const attachmentId = makeCommentAttachmentId();
  const fallbackExtension = extensionFromFileName(input.fileName) || extensionFromMimeType(input.mimeType);
  const objectKey = commentAttachmentObjectKey({
    attachmentId,
    extension: fallbackExtension,
    storageScopeId: input.storageScopeId,
    targetId: input.targetId,
    targetType: input.targetType,
  });

  let stored: { contentLength: number; peeked: Buffer };
  try {
    stored = await objectStorage.putObjectStream({
      body: input.body,
      contentType: "application/octet-stream",
      key: objectKey,
      maxBytes: input.maxBytes,
      peekBytes: 256 * 1024,
    });
  } catch (error) {
    if (error instanceof ObjectStorageUploadTooLargeError) return { status: "tooLarge" };
    if (error instanceof ObjectStorageUploadEmptyError) return { status: "invalid" };
    throw error;
  }

  const metadata = safeCommentAttachmentMetadata({ body: stored.peeked, fileName: input.fileName, mimeType: input.mimeType });
  const fileName = sanitizeCommentAttachmentFileName(input.fileName, metadata.extension);
  const attachedAt = input.messageId ? input.createdAt : null;
  const expiresAt = pendingCommentAttachmentExpiresAt(input.createdAt);
  const row: CommentAttachmentInsert = {
    id: attachmentId,
    teamId: input.storageScopeId,
    targetType: input.targetType,
    targetId: input.targetId,
    messageId: input.messageId,
    objectKey,
    fileName,
    mimeType: metadata.mimeType,
    fileSize: stored.contentLength,
    width: metadata.width ?? null,
    height: metadata.height ?? null,
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
