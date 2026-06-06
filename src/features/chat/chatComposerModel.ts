import type { ChatAttachment } from "../../types/orf";
import type { ChatDraft } from "./chatModels";

export type ChatComposerHistoryState = {
  cursorIndex: number | null;
  entries: ChatDraft[];
  restoreDraft: ChatDraft | null;
};

export type ChatAttachmentDraftItem =
  | {
      clientId: string;
      error: string;
      file: File;
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
      file: File;
      fileName: string;
      fileSize: number;
      mimeType: string;
      status: "uploading";
    };

const CHAT_COMPOSER_HISTORY_LIMIT = 20;
export const emptyComposerHistory: ChatComposerHistoryState = { cursorIndex: null, entries: [], restoreDraft: null };

function createAttachmentClientId() {
  return globalThis.crypto?.randomUUID?.() ?? `chat-attachment-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function cloneDraft(draft: ChatDraft): ChatDraft {
  return { text: draft.text, mentions: draft.mentions.map((mention) => ({ ...mention })) };
}

export function recordSentComposerDraft(history: ChatComposerHistoryState, draft: ChatDraft): ChatComposerHistoryState {
  if (!draft.text.trim()) return { ...history, cursorIndex: null, restoreDraft: null };
  const current = cloneDraft(draft);
  const entries = [
    current,
    ...history.entries.filter((entry) => entry.text !== current.text),
  ].slice(0, CHAT_COMPOSER_HISTORY_LIMIT);
  return { cursorIndex: null, entries, restoreDraft: null };
}

export function recallComposerHistory(
  history: ChatComposerHistoryState,
  currentDraft: ChatDraft,
  direction: "older" | "newer",
): { draft: ChatDraft; history: ChatComposerHistoryState } | null {
  if (history.entries.length === 0) return null;
  if (direction === "older") {
    const nextIndex = history.cursorIndex === null ? 0 : Math.min(history.cursorIndex + 1, history.entries.length - 1);
    const restoreDraft = history.cursorIndex === null ? cloneDraft(currentDraft) : history.restoreDraft;
    return {
      draft: cloneDraft(history.entries[nextIndex]),
      history: { ...history, cursorIndex: nextIndex, restoreDraft },
    };
  }
  if (history.cursorIndex === null) return null;
  if (history.cursorIndex <= 0) {
    return {
      draft: cloneDraft(history.restoreDraft ?? { mentions: [], text: "" }),
      history: { ...history, cursorIndex: null, restoreDraft: null },
    };
  }
  const nextIndex = history.cursorIndex - 1;
  return {
    draft: cloneDraft(history.entries[nextIndex]),
    history: { ...history, cursorIndex: nextIndex },
  };
}

export function createAttachmentDraftItem(file: File): ChatAttachmentDraftItem {
  return {
    clientId: createAttachmentClientId(),
    file,
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
    item.clientId === clientId && item.status !== "uploaded"
      ? {
          clientId,
          error,
          file: item.file,
          fileName: item.fileName,
          fileSize: item.fileSize,
          mimeType: item.mimeType,
          status: "failed" as const,
        }
      : item
  ));
}

export function retryAttachmentDraftItem(items: ChatAttachmentDraftItem[], clientId: string) {
  return items.map((item) => (
    item.clientId === clientId && item.status === "failed"
      ? {
          clientId,
          file: item.file,
          fileName: item.fileName,
          fileSize: item.fileSize,
          mimeType: item.mimeType,
          status: "uploading" as const,
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
