export type AttachmentPreviewKind = "download" | "image" | "markdown" | "pdf" | "text";

const previewableTextFileExtensions = new Set(["csv", "json", "log", "txt"]);
const previewableTextMimeTypes = new Set(["application/json", "text/csv", "text/plain"]);
const unsafeTextPreviewFileExtensions = new Set(["htm", "html", "svg", "xhtml", "xml"]);

export function attachmentPreviewKind(row: Pick<{ fileName: string; mimeType: string }, "fileName" | "mimeType">): AttachmentPreviewKind {
  const mimeType = normalizeAttachmentPreviewMimeType(row.mimeType);
  const fileName = row.fileName.toLowerCase();
  const extension = extensionFromAttachmentPreviewFileName(fileName);
  if (mimeType === "image/gif" || mimeType === "image/jpeg" || mimeType === "image/png" || mimeType === "image/webp") return "image";
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType === "text/markdown" || fileName.endsWith(".md") || fileName.endsWith(".markdown")) return "markdown";
  if (previewableTextFileExtensions.has(extension) || (previewableTextMimeTypes.has(mimeType) && !unsafeTextPreviewFileExtensions.has(extension))) return "text";
  return "download";
}

function normalizeAttachmentPreviewMimeType(value: string) {
  return value.split(";")[0]?.trim().toLowerCase() ?? "";
}

function extensionFromAttachmentPreviewFileName(fileName: string) {
  const leafName = fileName.split(/[\\/]/).pop()?.trim() ?? "";
  const match = /\.([A-Za-z0-9]{1,16})$/.exec(leafName);
  return match?.[1]?.toLowerCase() ?? "";
}
