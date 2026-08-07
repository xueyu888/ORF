import { commentAttachmentPreviewKind } from "../repositories/commentAttachmentRepository";
import type { CommentAttachment } from "../../src/types/orf";
import type { feedbackReportAttachments } from "../../modules/feedback/src/infrastructure/database/schema";

type FeedbackReportAttachmentRow = typeof feedbackReportAttachments.$inferSelect | typeof feedbackReportAttachments.$inferInsert;

export function feedbackReportAttachmentContentUrl(id: string) {
  return `/api/feedback/report-attachments/${encodeURIComponent(id)}/content`;
}

export function feedbackReportAttachmentDownloadUrl(id: string) {
  return `/api/feedback/report-attachments/${encodeURIComponent(id)}/content?disposition=attachment`;
}

export function feedbackReportAttachmentPreviewUrl(id: string) {
  return `/api/feedback/report-attachments/${encodeURIComponent(id)}/content?disposition=inline`;
}

export function feedbackReportAttachmentDto(row: FeedbackReportAttachmentRow): CommentAttachment {
  const previewKind = commentAttachmentPreviewKind(row);
  return {
    contentUrl: feedbackReportAttachmentContentUrl(row.id),
    downloadUrl: feedbackReportAttachmentDownloadUrl(row.id),
    id: row.id,
    fileName: row.fileName,
    mimeType: row.mimeType,
    fileSize: row.fileSize,
    previewKind,
    previewUrl: previewKind === "download" ? undefined : feedbackReportAttachmentPreviewUrl(row.id),
    width: row.width ?? undefined,
    height: row.height ?? undefined,
  };
}
