import type { ChatAttachment } from "../../types/orf";

export type ChatAttachmentDraftItem =
  | {
      clientId: string;
      error: string;
      fileName: string;
      fileSize: number;
      mimeType: string;
      status: "failed";
    }
  | {
      attachment: ChatAttachment;
      clientId: string;
      fileName: string;
      fileSize: number;
      mimeType: string;
      status: "uploaded";
    }
  | {
      clientId: string;
      fileName: string;
      fileSize: number;
      mimeType: string;
      status: "uploading";
    };

function createAttachmentClientId() {
  return globalThis.crypto?.randomUUID?.() ?? `chat-attachment-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createAttachmentDraftItem(file: File): ChatAttachmentDraftItem {
  return {
    clientId: createAttachmentClientId(),
    fileName: file.name,
    fileSize: file.size,
    mimeType: file.type || "application/octet-stream",
    status: "uploading",
  };
}

export function completeAttachmentDraftItem(items: ChatAttachmentDraftItem[], clientId: string, attachment: ChatAttachment) {
  return items.map((item) => (
    item.clientId === clientId
      ? {
          attachment,
          clientId,
          fileName: attachment.fileName,
          fileSize: attachment.fileSize,
          mimeType: attachment.mimeType,
          status: "uploaded" as const,
        }
      : item
  ));
}

export function failAttachmentDraftItem(items: ChatAttachmentDraftItem[], clientId: string, error: string) {
  return items.map((item) => (
    item.clientId === clientId
      ? {
          clientId,
          error,
          fileName: item.fileName,
          fileSize: item.fileSize,
          mimeType: item.mimeType,
          status: "failed" as const,
        }
      : item
  ));
}

export function removeAttachmentDraftItem(items: ChatAttachmentDraftItem[], clientId: string) {
  return items.filter((item) => item.clientId !== clientId);
}

export function uploadedDraftAttachments(items: ChatAttachmentDraftItem[]) {
  return items.flatMap((item) => item.status === "uploaded" ? [item.attachment] : []);
}

export function hasUploadingDraftAttachments(items: ChatAttachmentDraftItem[]) {
  return items.some((item) => item.status === "uploading");
}

export function failedDraftAttachmentCount(items: ChatAttachmentDraftItem[]) {
  return items.filter((item) => item.status === "failed").length;
}
