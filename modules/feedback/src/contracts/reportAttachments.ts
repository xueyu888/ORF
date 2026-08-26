export type FeedbackReportAttachmentPreviewKind = "download" | "image" | "markdown" | "pdf" | "text" | "video";

export type FeedbackReportAttachmentProjection = {
  readonly fileName: string;
  readonly fileSize: number;
  readonly height?: number | null;
  readonly id: string;
  readonly mimeType: string;
  readonly width?: number | null;
};

export type FeedbackReportAttachmentDto = {
  readonly contentUrl: string;
  readonly downloadUrl: string;
  readonly fileName: string;
  readonly fileSize: number;
  readonly height?: number;
  readonly id: string;
  readonly mimeType: string;
  readonly previewKind: FeedbackReportAttachmentPreviewKind;
  readonly previewUrl?: string;
  readonly width?: number;
};

const previewableTextFileExtensions = new Set(["csv", "json", "log", "txt"]);
const previewableTextMimeTypes = new Set(["application/json", "text/csv", "text/plain"]);
const unsafeTextPreviewFileExtensions = new Set(["htm", "html", "svg", "xhtml", "xml"]);
const ambiguousAttachmentMimeTypes = new Set(["", "application/octet-stream"]);
const nativeVideoMimeTypes = new Set(["video/mp4", "video/ogg", "video/quicktime", "video/webm", "video/x-m4v"]);
const nativeVideoMimeTypeByExtension = new Map([
  ["m4v", "video/x-m4v"],
  ["mov", "video/quicktime"],
  ["mp4", "video/mp4"],
  ["ogg", "video/ogg"],
  ["ogv", "video/ogg"],
  ["webm", "video/webm"],
]);

export function feedbackReportAttachmentContentUrl(id: string) {
  return `/api/feedback/report-attachments/${encodeURIComponent(id)}/content`;
}

export function feedbackReportAttachmentDownloadUrl(id: string) {
  return `/api/feedback/report-attachments/${encodeURIComponent(id)}/content?disposition=attachment`;
}

export function feedbackReportAttachmentPreviewUrl(id: string) {
  return `/api/feedback/report-attachments/${encodeURIComponent(id)}/content?disposition=inline`;
}

export function feedbackReportAttachmentPreviewKind(
  row: Pick<FeedbackReportAttachmentProjection, "fileName" | "mimeType">,
): FeedbackReportAttachmentPreviewKind {
  const mimeType = normalizeMimeType(row.mimeType);
  const fileName = row.fileName.toLowerCase();
  const extension = extensionFromFileName(fileName);
  if (mimeType === "image/gif" || mimeType === "image/jpeg" || mimeType === "image/png" || mimeType === "image/webp") return "image";
  if (mimeType === "application/pdf") return "pdf";
  if (feedbackReportAttachmentNativeVideoContentType(row)) return "video";
  if (mimeType === "text/markdown" || fileName.endsWith(".md") || fileName.endsWith(".markdown")) return "markdown";
  if (previewableTextFileExtensions.has(extension) || (previewableTextMimeTypes.has(mimeType) && !unsafeTextPreviewFileExtensions.has(extension))) return "text";
  return "download";
}

export function feedbackReportAttachmentNativeVideoContentType(
  row: Pick<FeedbackReportAttachmentProjection, "fileName" | "mimeType">,
): string | null {
  const mimeType = normalizeMimeType(row.mimeType);
  if (nativeVideoMimeTypes.has(mimeType)) return mimeType;
  if (!ambiguousAttachmentMimeTypes.has(mimeType)) return null;
  return nativeVideoMimeTypeByExtension.get(extensionFromFileName(row.fileName)) ?? null;
}

export function canPreviewFeedbackReportAttachment(row: Pick<FeedbackReportAttachmentProjection, "fileName" | "mimeType">) {
  return feedbackReportAttachmentPreviewKind(row) !== "download";
}

export function feedbackReportAttachmentDto(row: FeedbackReportAttachmentProjection): FeedbackReportAttachmentDto {
  const previewKind = feedbackReportAttachmentPreviewKind(row);
  return {
    contentUrl: feedbackReportAttachmentContentUrl(row.id),
    downloadUrl: feedbackReportAttachmentDownloadUrl(row.id),
    fileName: row.fileName,
    fileSize: row.fileSize,
    height: row.height ?? undefined,
    id: row.id,
    mimeType: row.mimeType,
    previewKind,
    previewUrl: previewKind === "download" ? undefined : feedbackReportAttachmentPreviewUrl(row.id),
    width: row.width ?? undefined,
  };
}

function normalizeMimeType(value: string) {
  return value.split(";")[0]?.trim().toLowerCase() ?? "";
}

function extensionFromFileName(fileName: string) {
  const leafName = fileName.split(/[\\/]/).pop()?.trim() ?? "";
  const match = /\.([A-Za-z0-9]{1,16})$/.exec(leafName);
  return match?.[1]?.toLowerCase() ?? "";
}
