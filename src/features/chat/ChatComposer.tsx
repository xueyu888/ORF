import { clsx } from "clsx";
import {
  AtSign,
  Bold,
  Code,
  FileText,
  Image as ImageIcon,
  Italic,
  Link as LinkIcon,
  Loader2,
  Paperclip,
  Quote,
  Send,
  X,
} from "lucide-react";
import { type ChangeEvent, type ClipboardEvent, type DragEvent, type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { Avatar } from "../../components/ui";
import { uploadChatAttachment } from "../../state/apiClient";
import type { ChatAttachment, ChatUser } from "../../types/orf";
import {
  type ChatAttachmentDraftItem,
  completeAttachmentDraftItem,
  createAttachmentDraftItem,
  emptyComposerHistory,
  failedDraftAttachmentCount,
  failAttachmentDraftItem,
  hasUploadingDraftAttachments,
  recallComposerHistory,
  recordSentComposerDraft,
  removeAttachmentDraftItem,
  uploadedDraftAttachments,
} from "./chatComposerModel";
import {
  type ChatDraft,
  chatDraftStorageKey,
  emptyDraft,
  hasStoredDraftForChannel,
  mentionLabel,
  mentionRangeFor,
  parseStoredDraft,
  reconcileMentions,
} from "./chatModels";

type ChatComposerProps = {
  channelId: string;
  disabled?: boolean;
  mentionableUsers: ChatUser[];
  onDraftStateChange?: (channelId: string, hasDraft: boolean) => void;
  onSend: (draft: ChatDraft, attachments: ChatAttachment[], rootMessageId?: string | null, parentMessageId?: string | null) => Promise<void>;
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
  const [mentionRange, setMentionRange] = useState<ReturnType<typeof mentionRangeFor>>(null);
  const [selectedMention, setSelectedMention] = useState(0);
  const [draggingFiles, setDraggingFiles] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState(emptyComposerHistory);
  const [submitting, setSubmitting] = useState(false);
  const uploading = hasUploadingDraftAttachments(attachmentItems);
  const busy = uploading || submitting;
  const failedUploads = failedDraftAttachmentCount(attachmentItems);
  const draftStorageKey = useMemo(() => chatDraftStorageKey(channelId, rootMessageId), [channelId, rootMessageId]);
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const activeDraftStorageKeyRef = useRef(draftStorageKey);
  const submittingRef = useRef(false);
  const mentionUsers = useMemo(() => {
    if (!mentionRange) return [];
    const query = mentionRange.query.toLowerCase();
    return mentionableUsers
      .filter((user) => user.status === "active")
      .filter((user) => user.name.toLowerCase().includes(query) || user.email.toLowerCase().includes(query))
      .slice(0, 8);
  }, [mentionRange, mentionableUsers]);

  useEffect(() => {
    activeDraftStorageKeyRef.current = draftStorageKey;
    setDraft(parseStoredDraft(window.localStorage.getItem(draftStorageKey)));
    setAttachmentItems([]);
    setError("");
    setMentionRange(null);
    setSelectedMention(0);
    setDraggingFiles(false);
    setHistory(emptyComposerHistory);
    setSubmitting(false);
    submittingRef.current = false;
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

  const setText = (text: string, cursor: number) => {
    const mentions = reconcileMentions(draft.text, text, draft.mentions);
    setDraft({ text, mentions });
    setMentionRange(mentionRangeFor(text, cursor, mentions));
    setHistory((item) => item.cursorIndex === null ? item : { ...item, cursorIndex: null, restoreDraft: null });
    onTyping?.();
  };

  const insertMarkdown = (before: string, after = before) => {
    const textarea = textAreaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const nextText = `${draft.text.slice(0, start)}${before}${draft.text.slice(start, end)}${after}${draft.text.slice(end)}`;
    const mentions = reconcileMentions(draft.text, nextText, draft.mentions);
    const cursor = start + before.length;
    setDraft({ text: nextText, mentions });
    setMentionRange(mentionRangeFor(nextText, cursor, mentions));
    setSelectedMention(0);
    setHistory((item) => item.cursorIndex === null ? item : { ...item, cursorIndex: null, restoreDraft: null });
    onTyping?.();
    window.setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(cursor, end + before.length);
    }, 0);
  };

  const insertMention = (user: ChatUser) => {
    if (!mentionRange) return;
    const label = mentionLabel(user.name);
    const replacement = `@${label}`;
    const nextText = `${draft.text.slice(0, mentionRange.start)}${replacement} ${draft.text.slice(mentionRange.end)}`;
    const nextMention = {
      start: mentionRange.start,
      end: mentionRange.start + replacement.length,
      label,
      userId: user.id,
    };
    const mentions = [
      ...draft.mentions.filter((mention) => mention.end <= mentionRange.start || mention.start >= mentionRange.end),
      nextMention,
    ].sort((left, right) => left.start - right.start);
    setDraft({ text: nextText, mentions });
    setMentionRange(null);
    window.setTimeout(() => {
      const cursor = nextMention.end + 1;
      textAreaRef.current?.focus();
      textAreaRef.current?.setSelectionRange(cursor, cursor);
    }, 0);
  };

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

  const submit = async () => {
    if (disabled || busy || submittingRef.current) return;
    const uploadedAttachments = uploadedDraftAttachments(attachmentItems);
    if (!draft.text.trim() && uploadedAttachments.length === 0) return;
    if (failedUploads > 0) {
      setError("请移除上传失败的附件后发送");
      return;
    }
    setError("");
    submittingRef.current = true;
    setSubmitting(true);
    try {
      await onSend(draft, uploadedAttachments, rootMessageId, parentMessageId);
      setHistory((item) => recordSentComposerDraft(item, draft));
      setDraft(emptyDraft);
      setAttachmentItems([]);
      setMentionRange(null);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "发送消息失败");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionRange && mentionUsers.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedMention((index) => (index + 1) % mentionUsers.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedMention((index) => (index - 1 + mentionUsers.length) % mentionUsers.length);
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        insertMention(mentionUsers[selectedMention] ?? mentionUsers[0]);
        return;
      }
      if (event.key === "Escape") {
        setMentionRange(null);
        return;
      }
    }
    if (event.key === "ArrowUp" && !event.shiftKey) {
      const textarea = textAreaRef.current;
      const canRecall = textarea?.selectionStart === 0 && (history.cursorIndex !== null || !draft.text.trim());
      if (canRecall) {
        const recalled = recallComposerHistory(history, draft, "older");
        if (recalled) {
          event.preventDefault();
          setDraft(recalled.draft);
          setHistory(recalled.history);
          setMentionRange(null);
          window.setTimeout(() => {
            const next = textAreaRef.current;
            if (!next) return;
            next.focus();
            next.setSelectionRange(0, 0);
          }, 0);
          return;
        }
      }
    }
    if (event.key === "ArrowDown" && !event.shiftKey && history.cursorIndex !== null) {
      const textarea = textAreaRef.current;
      const canRecall = textarea ? textarea.selectionStart === textarea.value.length : true;
      if (canRecall) {
        const recalled = recallComposerHistory(history, draft, "newer");
        if (recalled) {
          event.preventDefault();
          setDraft(recalled.draft);
          setHistory(recalled.history);
          setMentionRange(null);
          window.setTimeout(() => {
            const next = textAreaRef.current;
            if (!next) return;
            next.focus();
            const cursor = next.value.length;
            next.setSelectionRange(cursor, cursor);
          }, 0);
          return;
        }
      }
    }
    if (event.key === "Enter" && !event.shiftKey && !event.altKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void submit();
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
      <div className="orf-chat-composer-box">
        <textarea
          disabled={disabled}
          onChange={(event) => setText(event.target.value, event.target.selectionStart)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={disabled ? "当前没有发送权限" : rootMessageId ? "回复该话题..." : "发送消息..."}
          ref={textAreaRef}
          rows={3}
          value={draft.text}
        />
        {mentionRange && (
          <div className="orf-chat-mention-menu">
            {mentionUsers.length > 0 ? mentionUsers.map((user, index) => (
              <button
                className={index === selectedMention ? "orf-chat-mention-option-active" : ""}
                key={user.id}
                type="button"
                onClick={() => insertMention(user)}
              >
                <Avatar avatarUrl={user.avatarUrl} name={user.name} size="sm" />
                <span>{user.name}</span>
                <small>{user.email}</small>
              </button>
            )) : <div className="orf-chat-mention-empty">没有匹配成员</div>}
          </div>
        )}
        <div className="orf-chat-composer-toolbar">
          <button type="button" onClick={() => insertMarkdown("**")} title="加粗"><Bold className="h-4 w-4" /></button>
          <button type="button" onClick={() => insertMarkdown("_")} title="斜体"><Italic className="h-4 w-4" /></button>
          <button type="button" onClick={() => insertMarkdown("`")} title="代码"><Code className="h-4 w-4" /></button>
          <button type="button" onClick={() => insertMarkdown("> ", "")} title="引用"><Quote className="h-4 w-4" /></button>
          <button type="button" onClick={() => insertMarkdown("[", "](https://)")} title="链接"><LinkIcon className="h-4 w-4" /></button>
          <button type="button" onClick={() => fileRef.current?.click()} title="附件"><Paperclip className="h-4 w-4" /></button>
          <button type="button" onClick={() => insertMarkdown("@", "")} title="提及成员"><AtSign className="h-4 w-4" /></button>
          <span className="orf-chat-composer-spacer" />
          {uploading && <Loader2 className="h-4 w-4 animate-spin" />}
          <button type="button" className="orf-chat-send-button" disabled={disabled || busy} onClick={() => void submit()} title="发送">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
          <input multiple hidden ref={fileRef} type="file" onChange={(event) => void handleFiles(event)} />
        </div>
      </div>
    </div>
  );
}
