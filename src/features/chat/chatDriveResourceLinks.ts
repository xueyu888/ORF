import type { DriveNode } from "../../types/orf";

export type ChatDriveResourceLinkTarget = {
  fileId?: string;
  nodeId?: string;
};

export type ChatDriveResourceSelectionRequest = ChatDriveResourceLinkTarget & {
  requestId: number;
};

const fallbackOrigin = "https://orf.local";

export function chatDriveResourcePreviewHref(nodeId: string) {
  return `/resources/${encodeURIComponent(nodeId)}/preview`;
}

export function parseChatDriveResourceHref(href: string): ChatDriveResourceLinkTarget | null {
  const url = urlForChatDriveResourceHref(href);
  if (!url) return null;

  if (isExternalHttpUrl(href) && !isCurrentOrigin(url.origin)) {
    return null;
  }

  const pathname = url.pathname.replace(/\/+$/, "");
  const fileContentMatch = /^\/api\/drive\/files\/([^/]+)\/content$/.exec(pathname);
  if (fileContentMatch?.[1]) {
    return { fileId: safeDecodePathSegment(fileContentMatch[1]) };
  }

  const resourceMatch = /^\/resources\/([^/]+)(?:\/preview)?$/.exec(pathname);
  if (resourceMatch?.[1]) {
    return { nodeId: safeDecodePathSegment(resourceMatch[1]) };
  }

  return null;
}

export function driveNodeMatchesChatResourceTarget(node: DriveNode, target: ChatDriveResourceLinkTarget) {
  if (target.nodeId && node.id === target.nodeId) return true;
  if (target.fileId && node.file?.id === target.fileId) return true;
  return false;
}

function urlForChatDriveResourceHref(href: string) {
  const trimmed = href.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed, currentOrigin() ?? fallbackOrigin);
  } catch {
    return null;
  }
}

function currentOrigin() {
  return typeof window === "undefined" ? null : window.location.origin;
}

function isCurrentOrigin(origin: string) {
  const current = currentOrigin();
  return Boolean(current && origin === current);
}

function isExternalHttpUrl(href: string) {
  return /^https?:\/\//i.test(href.trim());
}

function safeDecodePathSegment(segment: string) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}
