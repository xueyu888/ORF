import type { Drive, DriveNode } from "../../types/orf";

export function driveNodeMetaLabel(node: DriveNode) {
  if (node.deletedAt) return `已删除 · ${formatDriveDateTime(node.deletedAt)}`;
  if (node.type === "folder") return "文件夹";
  if (!node.file) return "文件";
  return `${drivePreviewKindLabel(node.file.previewKind)} · ${formatDriveFileSize(node.file.fileSize)}`;
}

export function drivePreviewKindLabel(kind: Drive["previewKind"]) {
  if (kind === "image") return "图片";
  if (kind === "pdf") return "PDF";
  if (kind === "markdown") return "Markdown";
  if (kind === "text") return "文本";
  return "文件";
}

export function drivePreviewUrl(file: Drive) {
  const base = file.previewUrl ?? file.contentUrl;
  const separator = base.includes("?") ? "&" : "?";
  const cacheKey = file.latestVersionNumber ?? file.versionCount ?? file.createdAt;
  return `${base}${separator}v=${encodeURIComponent(String(cacheKey))}`;
}

export function compareDriveNodes(left: DriveNode, right: DriveNode) {
  if (left.type !== right.type) return left.type === "folder" ? -1 : 1;
  return left.name.localeCompare(right.name, "zh-CN");
}

export function formatDriveFileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  const digits = unitIndex === 0 || size >= 10 ? 0 : 1;
  return `${size.toFixed(digits)} ${units[unitIndex]}`;
}

export function formatDriveDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}
