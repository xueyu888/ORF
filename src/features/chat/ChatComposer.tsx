import { clsx } from "clsx";
import {
  FileText,
  Image as ImageIcon,
  Loader2,
  Paperclip,
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
  mentionableUsers: ChatUser[];
  onDraftStateChange?: (channelId: string, hasDraft: boolean) => void;
  onSend: ChatSendHandler;
  onTyping?: () => void;
  parentMessageId?: string | null;
  rootMessageId?: string | null;
};

export function ChatComposer({
  channelId,
  disabled,
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
  const draftStorageKey = useMemo(() => chatDraftStorageKey(channelId, rootMessageId), [channelId, rootMessageId]);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const activeDraftStorageKeyRef = useRef(draftStorageKey);

  useEffect(() => {
    activeDraftStorageKeyRef.current = draftStorageKey;
    setDraft(parseStoredDraft(window.localStorage.getItem(draftStorageKey)));
    setAttachmentItems([]);
    setError("");
    setDraggingFiles(false);
  }, [draftStorageKey]);

  useEffect(() => {
    if (activeDraftStorageKeyRef.current !== draftStorageKey) return;
    if (draft.text.trim()) {
      window.localStorage.setItem(draftStorageKey, JSON.stringify(draft));
      onDraftStateChange?.(channelId, true);
    } else {
      window.localStorage.removeItem(draftStorageKey);
      onDraftStateChange?.(channelId, hasStoredDraftForChannel(channelId));
    }
  }, [channelId, draft, draftStorageKey, onDraftStateChange]);

  const uploadFiles = async (files: File[]) => {
    if (disabled) return;
    if (files.length === 0) return;
    setError("");
    const uploads = files.slice(0, 10).map((file) => ({ file, item: createAttachmentDraftItem(file) }));
    setAttachmentItems((items) => [...items, ...uploads.map((upload) => upload.item)]);
    for (const upload of uploads) {
      try {
        const response = await uploadChatAttachment({ channelId, file: upload.file });
        setAttachmentItems((items) => completeAttachmentDraftItem(items, upload.item.clientId, response.attachment));
      } catch (uploadError) {
        const message = uploadError instanceof Error ? uploadError.message : "上传附件失败";
        setAttachmentItems((items) => failAttachmentDraftItem(items, upload.item.clientId, message));
        setError(message);
      }
    }
  };

  const handleFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    await uploadFiles(Array.from(event.target.files ?? []));
    event.target.value = "";
  };

  const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(event.clipboardData.files ?? []).filter((file) => file.size > 0);
    if (files.length === 0) return;
    event.preventDefault();
    void uploadFiles(files);
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
    void uploadFiles(files);
  };

  const submit = async (nextDraft: ChatDraft) => {
    const uploadedAttachments = uploadedDraftAttachments(attachmentItems);
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
              <button type="button" onClick={() => setAttachmentItems((items) => removeAttachmentDraftItem(items, item.clientId))}>
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
        mentionableUsers={mentionableUsers}
        onChange={setDraft}
        onPaste={handlePaste}
        onSubmit={submit}
        onTyping={onTyping}
        placeholder={disabled ? "当前没有发送权限" : rootMessageId ? "回复该话题..." : "发送消息..."}
        recordHistoryOnSubmit
        resetKey={draftStorageKey}
        submitDisabled={uploading}
        toolbarControls={<button type="button" onClick={() => fileRef.current?.click()} title="附件"><Paperclip className="h-4 w-4" /></button>}
        toolbarEnd={({ submit: submitDraft, submitting }) => (
          <>
            {uploading && <Loader2 className="h-4 w-4 animate-spin" />}
            <button type="button" className="orf-chat-send-button" disabled={disabled || uploading || submitting} onClick={submitDraft} title="发送">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
            <input multiple hidden ref={fileRef} type="file" onChange={(event) => void handleFiles(event)} />
          </>
        )}
      />
    </div>
  );
}
