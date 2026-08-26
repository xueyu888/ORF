export type AttachmentPreviewKind = "download" | "image" | "markdown" | "pdf" | "text" | "video";

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

export function attachmentPreviewKind(row: Pick<{ fileName: string; mimeType: string }, "fileName" | "mimeType">): AttachmentPreviewKind {
  const mimeType = normalizeAttachmentPreviewMimeType(row.mimeType);
  const fileName = row.fileName.toLowerCase();
  const extension = extensionFromAttachmentPreviewFileName(fileName);
  if (mimeType === "image/gif" || mimeType === "image/jpeg" || mimeType === "image/png" || mimeType === "image/webp") return "image";
  if (mimeType === "application/pdf") return "pdf";
  if (attachmentNativeVideoContentType(row)) return "video";
  if (mimeType === "text/markdown" || fileName.endsWith(".md") || fileName.endsWith(".markdown")) return "markdown";
  if (previewableTextFileExtensions.has(extension) || (previewableTextMimeTypes.has(mimeType) && !unsafeTextPreviewFileExtensions.has(extension))) return "text";
  return "download";
}

export function attachmentNativeVideoContentType(row: Pick<{ fileName: string; mimeType: string }, "fileName" | "mimeType">) {
  const mimeType = normalizeAttachmentPreviewMimeType(row.mimeType);
  if (nativeVideoMimeTypes.has(mimeType)) return mimeType;
  if (!ambiguousAttachmentMimeTypes.has(mimeType)) return null;
  return nativeVideoMimeTypeByExtension.get(extensionFromAttachmentPreviewFileName(row.fileName)) ?? null;
}

function normalizeAttachmentPreviewMimeType(value: string) {
  return value.split(";")[0]?.trim().toLowerCase() ?? "";
}

function extensionFromAttachmentPreviewFileName(fileName: string) {
  const leafName = fileName.split(/[\\/]/).pop()?.trim() ?? "";
  const match = /\.([A-Za-z0-9]{1,16})$/.exec(leafName);
  return match?.[1]?.toLowerCase() ?? "";
}
