import { clsx } from "clsx";
import {
  FileText,
  Image as ImageIcon,
  Loader2,
  Paperclip,
  RotateCcw,
  Send,
  X,
} from "lucide-react";
import { type ChangeEvent, type ClipboardEvent, type DragEvent, useEffect, useMemo, useRef, useState } from "react";
import { uploadChatAttachment } from "../../state/apiClient";
import type { ChatAttachment, ChatUser } from "../../types/orf";
import {
  type ChatAttachmentDraftItem,
  completeAttachmentDraftItem,
  createAttachmentDraftItem,
  failedDraftAttachmentCount,
  failAttachmentDraftItem,
  hasUploadingDraftAttachments,
  removeAttachmentDraftItem,
  retryAttachmentDraftItem,
  uploadedDraftAttachments,
} from "./chatComposerModel";
import {
  type ChatDraft,
  type ChatSendHandler,
  chatDraftStorageKey,
  emptyDraft,
  hasStoredDraftForChannel,
  parseStoredDraft,
} from "./chatModels";
import { ChatDraftEditor } from "./ChatDraftEditor";

type ChatComposerProps = {
  channelId: string;
  disabled?: boolean;
  focusSignal?: number;
  mentionableUsers: ChatUser[];
  onDraftStateChange?: (channelId: string, hasDraft: boolean) => void;
  onSend: ChatSendHandler;
  onTyping?: (channelId: string) => void;
  parentMessageId?: string | null;
  rootMessageId?: string | null;
};

export function ChatComposer({
  channelId,
  disabled,
  focusSignal,
  mentionableUsers,
  onDraftStateChange,
  onSend,
  onTyping,
  rootMessageId,
  parentMessageId,
}: ChatComposerProps) {
  const [draft, setDraft] = useState<ChatDraft>(emptyDraft);
  const [attachmentItems, setAttachmentItems] = useState<ChatAttachmentDraftItem[]>([]);
  const [draggingFiles, setDraggingFiles] = useState(false);
  const [error, setError] = useState("");
  const uploading = hasUploadingDraftAttachments(attachmentItems);
  const failedUploads = failedDraftAttachmentCount(attachmentItems);
  const uploadedAttachments = uploadedDraftAttachments(attachmentItems);
  const hasSendableDraft = draft.text.trim().length > 0 || uploadedAttachments.length > 0;
  const draftStorageKey = useMemo(() => chatDraftStorageKey(channelId, rootMessageId), [channelId, rootMessageId]);
  const attachmentDraftCacheRef = useRef(new Map<string, ChatAttachmentDraftItem[]>());
  const attachmentItemsRef = useRef<ChatAttachmentDraftItem[]>([]);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const activeDraftStorageKeyRef = useRef(draftStorageKey);

  const updateAttachmentItemsForDraftKey = (
    targetDraftStorageKey: string,
    updater: (items: ChatAttachmentDraftItem[]) => ChatAttachmentDraftItem[],
  ) => {
    if (activeDraftStorageKeyRef.current === targetDraftStorageKey) {
      setAttachmentItems((items) => {
        const nextItems = updater(items);
        attachmentItemsRef.current = nextItems;
        attachmentDraftCacheRef.current.set(targetDraftStorageKey, nextItems);
        return nextItems;
      });
      return;
    }
    const nextItems = updater(attachmentDraftCacheRef.current.get(targetDraftStorageKey) ?? []);
    attachmentDraftCacheRef.current.set(targetDraftStorageKey, nextItems);
  };

  useEffect(() => {
    attachmentItemsRef.current = attachmentItems;
    attachmentDraftCacheRef.current.set(activeDraftStorageKeyRef.current, attachmentItems);
  }, [attachmentItems]);

  useEffect(() => {
    attachmentDraftCacheRef.current.set(activeDraftStorageKeyRef.current, attachmentItemsRef.current);
    activeDraftStorageKeyRef.current = draftStorageKey;
    setDraft(parseStoredDraft(window.localStorage.getItem(draftStorageKey)));
    setAttachmentItems(attachmentDraftCacheRef.current.get(draftStorageKey) ?? []);
    setError("");
    setDraggingFiles(false);
  }, [draftStorageKey]);

  useEffect(() => {
    if (activeDraftStorageKeyRef.current !== draftStorageKey) return;
    if (draft.text.trim()) {
      window.localStorage.setItem(draftStorageKey, JSON.stringify(draft));
    } else {
      window.localStorage.removeItem(draftStorageKey);
    }
    if (draft.text.trim() || attachmentItems.length > 0) {
      onDraftStateChange?.(channelId, true);
    } else {
      onDraftStateChange?.(channelId, hasStoredDraftForChannel(channelId));
    }
  }, [attachmentItems.length, channelId, draft, draftStorageKey, onDraftStateChange]);

  const uploadDraftAttachment = async (clientId: string, file: File, uploadChannelId: string, uploadDraftStorageKey: string) => {
    try {
      const response = await uploadChatAttachment({ channelId: uploadChannelId, file });
      updateAttachmentItemsForDraftKey(uploadDraftStorageKey, (items) => completeAttachmentDraftItem(items, clientId, response.attachment));
    } catch (uploadError) {
      const message = uploadError instanceof Error ? uploadError.message : "上传附件失败";
      updateAttachmentItemsForDraftKey(uploadDraftStorageKey, (items) => failAttachmentDraftItem(items, clientId, message));
      if (activeDraftStorageKeyRef.current === uploadDraftStorageKey) {
        setError(message);
      }
    }
  };

  const uploadFiles = (files: File[]) => {
    if (disabled) return;
    if (files.length === 0) return;
    const filesToUpload = files.slice(0, 10);
    setError(files.length > filesToUpload.length ? "一次最多添加 10 个附件，已忽略多余文件" : "");
    const uploads = filesToUpload.map((file) => ({ file, item: createAttachmentDraftItem(file) }));
    updateAttachmentItemsForDraftKey(draftStorageKey, (items) => [...items, ...uploads.map((upload) => upload.item)]);
    const uploadChannelId = channelId;
    const uploadDraftStorageKey = draftStorageKey;
    void Promise.all(uploads.map((upload) => uploadDraftAttachment(
      upload.item.clientId,
      upload.file,
      uploadChannelId,
      uploadDraftStorageKey,
    )));
  };

  const retryUpload = (item: ChatAttachmentDraftItem) => {
    if (disabled || item.status !== "failed") return;
    setError("");
    updateAttachmentItemsForDraftKey(draftStorageKey, (items) => retryAttachmentDraftItem(items, item.clientId));
    void uploadDraftAttachment(item.clientId, item.file, channelId, draftStorageKey);
  };

  const handleFiles = (event: ChangeEvent<HTMLInputElement>) => {
    uploadFiles(Array.from(event.target.files ?? []));
    event.target.value = "";
  };

  const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(event.clipboardData.files ?? []).filter((file) => file.size > 0);
    if (files.length === 0) return;
    event.preventDefault();
    uploadFiles(files);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (Array.from(event.dataTransfer.types).includes("Files")) {
      event.preventDefault();
      setDraggingFiles(true);
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    if (disabled) return;
    const files = Array.from(event.dataTransfer.files ?? []).filter((file) => file.size > 0);
    if (files.length === 0) return;
    event.preventDefault();
    setDraggingFiles(false);
    uploadFiles(files);
  };

  const submit = async (nextDraft: ChatDraft) => {
    if (!nextDraft.text.trim() && uploadedAttachments.length === 0) return false;
    if (failedUploads > 0) {
      setError("请移除上传失败的附件后发送");
      return false;
    }
    setError("");
    try {
      await onSend({
        attachments: uploadedAttachments,
        channelId,
        draft: nextDraft,
        parentMessageId,
        rootMessageId,
      });
      setDraft(emptyDraft);
      setAttachmentItems([]);
      attachmentDraftCacheRef.current.set(draftStorageKey, []);
      return true;
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "发送消息失败");
      return false;
    }
  };

  return (
    <div
      className={clsx("orf-chat-composer", draggingFiles && "orf-chat-composer-dragging")}
      onDragLeave={() => setDraggingFiles(false)}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {attachmentItems.length > 0 && (
        <div className="orf-chat-pending-attachments">
          {attachmentItems.map((item) => (
            <span className={item.status === "failed" ? "orf-chat-pending-attachment-failed" : ""} key={item.clientId}>
              {item.status === "uploading" ? <Loader2 className="h-4 w-4 animate-spin" /> : item.mimeType.startsWith("image/") ? <ImageIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
              {item.fileName}
              {item.status === "failed" && <small>{item.error}</small>}
              {item.status === "uploading" && <small>上传中</small>}
              {item.status === "failed" && (
                <button type="button" onClick={() => retryUpload(item)} title="重试上传" aria-label="重试上传">
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              )}
              <button type="button" onClick={() => updateAttachmentItemsForDraftKey(draftStorageKey, (items) => removeAttachmentDraftItem(items, item.clientId))}>
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}
      {error && <div className="orf-chat-composer-error">{error}</div>}
      <ChatDraftEditor
        className="orf-chat-composer-box"
        disabled={disabled}
        draft={draft}
        focusSignal={focusSignal}
        mentionableUsers={mentionableUsers}
        onChange={setDraft}
        onPaste={handlePaste}
        onSubmit={submit}
        onTyping={() => onTyping?.(channelId)}
        placeholder={disabled ? "当前没有发送权限" : rootMessageId ? "回复该话题..." : "发送消息..."}
        recordHistoryOnSubmit
        resetKey={draftStorageKey}
        submitDisabled={uploading || failedUploads > 0 || !hasSendableDraft}
        toolbarControls={<button type="button" onClick={() => fileRef.current?.click()} title="附件"><Paperclip className="h-4 w-4" /></button>}
        toolbarEnd={({ submit: submitDraft, submitting }) => (
          <>
            {uploading && <Loader2 className="h-4 w-4 animate-spin" />}
            <button
              type="button"
              className="orf-chat-send-button"
              disabled={disabled || uploading || failedUploads > 0 || submitting || !hasSendableDraft}
              onClick={submitDraft}
              title={hasSendableDraft ? "发送" : "输入内容或添加附件后发送"}
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
            <input multiple hidden ref={fileRef} type="file" onChange={handleFiles} />
          </>
        )}
      />
    </div>
  );
}
