import { clsx } from "clsx";
import {
  BarChart3,
  CheckCheck,
  FileVideo,
  FileText,
  Image as ImageIcon,
  LockKeyhole,
  Loader2,
  Paperclip,
  RotateCcw,
  Send,
  X,
} from "lucide-react";
import { type ChangeEvent, type DragEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatPastedFeedbackLinks } from "@orf/feedback-module/contracts";
import { IconButton } from "../../components/ui";
import { attachmentPreviewKind } from "../../domain/attachmentPreviewKind";
import { uploadChatAttachment } from "../../state/apiClient";
import type { ChatAttachment, ChatUser } from "../../types/orf";
import { formatFileSize } from "./chatFormat";
import {
  type ChatAttachmentDraftItem,
  completeAttachmentDraftItem,
  createAttachmentDraftItem,
  failedDraftAttachmentCount,
  failAttachmentDraftItem,
  hasUploadingDraftAttachments,
  progressAttachmentDraftItem,
  removeAttachmentDraftItem,
  retryAttachmentDraftItem,
  uploadedDraftAttachments,
} from "./chatComposerModel";
import {
  type ChatDraft,
  type ChatFeedbackReference,
  type ChatSendHandler,
  chatDraftStorageKey,
  emptyDraft,
  hasStoredDraftForChannel,
  parseStoredDraft,
} from "./chatModels";
import { ChatDraftEditor } from "./ChatDraftEditor";
import { ChatPollComposer } from "./ChatPollComposer";
import type { ChatPollCreateInput } from "./chatPollModel";

type ChatComposerProps = {
  attachmentMaxBytes: number;
  channelId: string;
  disabled?: boolean;
  feedbackItems?: readonly ChatFeedbackReference[];
  focusSignal?: number;
  mentionableUsers: ChatUser[];
  onDraftStateChange?: (channelId: string, hasDraft: boolean) => void;
  onCreatePoll?: (input: ChatPollCreateInput) => Promise<void>;
  onEditLatest?: () => void;
  onReactToLatest?: () => void;
  onReplyToLatest?: () => void;
  onSend: ChatSendHandler;
  onTyping?: (channelId: string) => void;
  parentMessageId?: string | null;
  rootMessageId?: string | null;
};

export function ChatComposer({
  attachmentMaxBytes,
  channelId,
  disabled,
  feedbackItems = [],
  focusSignal,
  mentionableUsers,
  onDraftStateChange,
  onCreatePoll,
  onEditLatest,
  onReactToLatest,
  onReplyToLatest,
  onSend,
  onTyping,
  rootMessageId,
  parentMessageId,
}: ChatComposerProps) {
  const [draft, setDraft] = useState<ChatDraft>(emptyDraft);
  const [attachmentItems, setAttachmentItems] = useState<ChatAttachmentDraftItem[]>([]);
  const [draggingFiles, setDraggingFiles] = useState(false);
  const [error, setError] = useState("");
  const [requireAcknowledgement, setRequireAcknowledgement] = useState(false);
  const [pollComposerOpen, setPollComposerOpen] = useState(false);
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
  const uploadProgressLabel = (item: ChatAttachmentDraftItem) => {
    if (item.status !== "uploading") return "";
    if (item.progress.percent === null) return "上传中";
    const percent = Math.round(item.progress.percent);
    return `${Math.max(0, Math.min(99, percent))}%`;
  };
  const uploadSpeedLabel = (bytesPerSecond: number | null) => (
    bytesPerSecond === null
      ? "速度计算中"
      : bytesPerSecond < 1024
        ? `${Math.max(1, Math.round(bytesPerSecond))} B/s`
        : `${formatFileSize(bytesPerSecond)}/s`
  );
  const uploadedByteLabel = (item: ChatAttachmentDraftItem) => {
    if (item.status !== "uploading") return formatFileSize(item.fileSize);
    const loadedBytes = item.fileSize > 0 ? Math.min(item.fileSize, item.progress.loadedBytes) : item.progress.loadedBytes;
    return `${formatFileSize(loadedBytes)} / ${formatFileSize(item.fileSize)}`;
  };
  const attachmentMetaLabel = (item: ChatAttachmentDraftItem) => {
    if (item.status === "uploading") {
      return `${uploadedByteLabel(item)} · ${uploadSpeedLabel(item.progress.bytesPerSecond)}`;
    }
    if (item.status === "failed") {
      return `${formatFileSize(item.fileSize)} · ${item.error}`;
    }
    return formatFileSize(item.fileSize);
  };
  const attachmentStatusLabel = (item: ChatAttachmentDraftItem) => {
    if (item.status === "uploading") return uploadProgressLabel(item);
    if (item.status === "failed") return "失败";
    return "已上传";
  };
  const attachmentIcon = (item: ChatAttachmentDraftItem) => {
    if (item.status === "uploading") return <Loader2 className="h-4 w-4 animate-spin" />;
    const previewKind = item.status === "uploaded"
      ? item.attachment.previewKind
      : attachmentPreviewKind({ fileName: item.fileName, mimeType: item.mimeType });
    if (previewKind === "image") return <ImageIcon className="h-4 w-4" />;
    if (previewKind === "video") return <FileVideo className="h-4 w-4" />;
    return <FileText className="h-4 w-4" />;
  };
  const uploadProgressTitle = (item: ChatAttachmentDraftItem) => {
    if (item.status !== "uploading") return "";
    return `${item.fileName} 上传进度：${uploadedByteLabel(item)}，${uploadSpeedLabel(item.progress.bytesPerSecond)}`;
  };

  useEffect(() => {
    if (rootMessageId) setRequireAcknowledgement(false);
  }, [rootMessageId]);

  useEffect(() => {
    if (!onCreatePoll || rootMessageId) setPollComposerOpen(false);
  }, [onCreatePoll, rootMessageId]);

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
      const response = await uploadChatAttachment({
        channelId: uploadChannelId,
        file,
        onProgress: (progress) => {
          updateAttachmentItemsForDraftKey(uploadDraftStorageKey, (items) => progressAttachmentDraftItem(items, clientId, {
            loadedBytes: progress.loadedBytes,
            percent: progress.percent,
            totalBytes: progress.totalBytes,
            recordedAtMs: progress.timestampMs,
          }));
        },
      });
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
    const oversizedFile = files.find((file) => file.size > attachmentMaxBytes);
    if (oversizedFile) {
      setError(`附件不能超过 ${formatFileSize(attachmentMaxBytes)}`);
      return;
    }
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

  const handlePastedFiles = (files: File[]) => {
    if (files.length === 0) return;
    uploadFiles(files);
  };
  const transformPastedText = useCallback(
    (text: string) => formatPastedFeedbackLinks(text, feedbackItems),
    [feedbackItems],
  );

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (Array.from(event.dataTransfer.types).includes("Files")) {
      event.preventDefault();
      setDraggingFiles(true);
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (event.defaultPrevented) return;
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
        requireAcknowledgement,
        rootMessageId,
      });
      setDraft(emptyDraft);
      setRequireAcknowledgement(false);
      setAttachmentItems([]);
      attachmentDraftCacheRef.current.set(draftStorageKey, []);
      return true;
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "发送消息失败");
      return false;
    }
  };

  if (disabled) {
    return (
      <div className="orf-chat-composer orf-chat-composer-readonly">
        <div className="orf-chat-composer-readonly-notice" role="status">
          <span className="orf-chat-composer-readonly-icon" aria-hidden="true">
            <LockKeyhole className="h-4 w-4" />
          </span>
          <span>当前没有发送权限</span>
        </div>
      </div>
    );
  }

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
            <span
              className={clsx(
                "orf-chat-pending-attachment",
                item.status === "failed" && "orf-chat-pending-attachment-failed",
                item.status === "uploading" && "orf-chat-pending-attachment-uploading",
              )}
              key={item.clientId}
              title={item.status === "uploading" ? uploadProgressTitle(item) : item.fileName}
            >
              <span className="orf-chat-pending-attachment-main">
                {attachmentIcon(item)}
                <span className="orf-chat-pending-attachment-name">{item.fileName}</span>
                <small>{attachmentStatusLabel(item)}</small>
              </span>
              <span className="orf-chat-pending-attachment-actions">
                {item.status === "failed" && (
                  <button type="button" onClick={() => retryUpload(item)} title="重试上传" aria-label="重试上传">
                    <RotateCcw className="h-3.5 w-3.5" />
                  </button>
                )}
                <button type="button" onClick={() => updateAttachmentItemsForDraftKey(draftStorageKey, (items) => removeAttachmentDraftItem(items, item.clientId))} title="移除附件" aria-label="移除附件">
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
              <span className="orf-chat-pending-attachment-meta">{attachmentMetaLabel(item)}</span>
              {item.status === "uploading" && (
                <span
                  className="orf-chat-pending-attachment-progress"
                  data-indeterminate={item.progress.percent === null ? "true" : "false"}
                  role="progressbar"
                  aria-label={`${item.fileName} 上传进度`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={item.progress.percent === null ? undefined : Math.round(item.progress.percent)}
                >
                  <span style={{ width: item.progress.percent === null ? undefined : `${Math.max(2, Math.min(100, item.progress.percent))}%` }} />
                </span>
              )}
            </span>
          ))}
        </div>
      )}
      {error && <div className="orf-chat-composer-error">{error}</div>}
      {pollComposerOpen && onCreatePoll && (
        <ChatPollComposer onClose={() => setPollComposerOpen(false)} onCreate={onCreatePoll} />
      )}
      <ChatDraftEditor
        autoGrow
        className="orf-chat-composer-box"
        disabled={disabled}
        draft={draft}
        feedbackItems={feedbackItems}
        focusSignal={focusSignal}
        mentionableUsers={mentionableUsers}
        onChange={setDraft}
        onEditLatest={attachmentItems.length === 0 ? onEditLatest : undefined}
        onFilesInsert={handlePastedFiles}
        onReactToLatest={onReactToLatest}
        onReplyToLatest={!rootMessageId && attachmentItems.length === 0 ? onReplyToLatest : undefined}
        onSubmit={submit}
        onTyping={() => onTyping?.(channelId)}
        placeholder={disabled ? "当前没有发送权限" : rootMessageId ? "回复该话题..." : "发送消息..."}
        recordHistoryOnSubmit
        resetKey={draftStorageKey}
        submitDisabled={uploading || failedUploads > 0 || !hasSendableDraft}
        transformPastedText={transformPastedText}
        toolbarControls={(
          <>
            {!rootMessageId && (
              <button
                type="button"
                className={clsx("orf-rich-text-tool-button", requireAcknowledgement && "orf-rich-text-tool-button-active")}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => setRequireAcknowledgement((value) => !value)}
                title={requireAcknowledgement ? "取消要求回执" : "要求回执"}
                aria-label={requireAcknowledgement ? "取消要求回执" : "要求回执"}
                aria-pressed={requireAcknowledgement}
              >
                <CheckCheck className="h-4 w-4" />
              </button>
            )}
            {!rootMessageId && onCreatePoll && (
              <button
                type="button"
                className={clsx("orf-rich-text-tool-button", pollComposerOpen && "orf-rich-text-tool-button-active")}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => setPollComposerOpen((open) => !open)}
                title={pollComposerOpen ? "关闭创建投票" : "创建投票"}
                aria-label={pollComposerOpen ? "关闭创建投票" : "创建投票"}
                aria-pressed={pollComposerOpen}
              >
                <BarChart3 className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              className="orf-rich-text-tool-button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => fileRef.current?.click()}
              title="附件"
              aria-label="附件"
            >
              <Paperclip className="h-4 w-4" />
            </button>
          </>
        )}
        toolbarEnd={({ submit: submitDraft, submitting }) => (
          <>
            {uploading && <Loader2 className="h-4 w-4 animate-spin" />}
            <IconButton
              className="orf-chat-send-button"
              type="button"
              icon={Send}
              label={hasSendableDraft ? "发送" : "输入内容或添加附件后发送"}
              disabled={disabled || uploading || failedUploads > 0 || submitting || !hasSendableDraft}
              loading={submitting}
              size="sm"
              variant="primary"
              onClick={submitDraft}
              title={hasSendableDraft ? "发送" : "输入内容或添加附件后发送"}
            />
            <input multiple hidden ref={fileRef} type="file" onChange={handleFiles} />
          </>
        )}
      />
    </div>
  );
}
