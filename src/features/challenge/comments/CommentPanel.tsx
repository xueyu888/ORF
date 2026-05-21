import { ArrowLeft, ChevronRight, ImagePlus, Pencil, Reply, Send, Trash2, X } from "lucide-react";
import type { ClipboardEvent, FormEvent, ReactNode } from "react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { clsx } from "clsx";
import { useDraggableFloating } from "../../../hooks/useDraggableFloating";
import type { CommentAttachment, CommentMessage, CommentTargetType, CommentThread } from "../../../types/orf";
import { avatarStyleForName } from "../../../utils/avatar";
import { initials } from "../../../utils/format";
import { parseCommentBodyLinks } from "./commentText";

type CommentEntry = {
  message: CommentMessage;
  replyCount: number;
  threadId: string;
};

type CommentDraftMode =
  | { type: "default" }
  | { type: "reply"; rootMessageId: string; targetAuthor: string; targetMessageId: string }
  | { type: "edit"; messageId: string; targetAuthor: string; threadId: string };

export type CommentReplyInput = {
  parentMessageId?: string;
  replyToAuthor?: string;
  replyToMessageId?: string;
};

const commentAttachmentTokenPattern = /!\[([^\]\n]*)\]\(orf-attachment:([A-Za-z0-9_-]+)\)/g;

export function CommentPanel({
  canManageAllComments = false,
  currentMember,
  onAddComment,
  onClose,
  onDeleteComment,
  onUpdateComment,
  onUploadAttachment,
  targetId,
  targetTitle,
  targetType,
  threads,
}: {
  canManageAllComments?: boolean;
  currentMember: string;
  onAddComment: (body: string, replyInput?: CommentReplyInput) => void;
  onClose: () => void;
  onDeleteComment: (threadId: string, messageId: string) => void;
  onUpdateComment: (threadId: string, messageId: string, body: string) => void;
  onUploadAttachment: (file: File) => Promise<string | null>;
  targetId: string;
  targetTitle: string;
  targetType: CommentTargetType;
  threads: CommentThread[];
}) {
  const [body, setBody] = useState("");
  const [draftMode, setDraftMode] = useState<CommentDraftMode>({ type: "default" });
  const [activeRootMessageId, setActiveRootMessageId] = useState<string | null>(null);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const panelDrag = useDraggableFloating<HTMLElement>({ resetKey: targetTitle });
  const commentEntries = useMemo<CommentEntry[]>(() => {
    const entries = threads.flatMap((thread) => thread.messages.map((message) => ({ threadId: thread.id, message })));
    const replyCounts = new Map<string, number>();

    for (const entry of entries) {
      if (entry.message.parentMessageId) {
        replyCounts.set(entry.message.parentMessageId, (replyCounts.get(entry.message.parentMessageId) ?? 0) + 1);
      }
    }

    return entries.map((entry) => ({ ...entry, replyCount: replyCounts.get(entry.message.id) ?? 0 }));
  }, [threads]);
  const rootEntries = useMemo(
    () => commentEntries.filter((entry) => !entry.message.parentMessageId).sort((left, right) => right.message.createdAt.localeCompare(left.message.createdAt)),
    [commentEntries],
  );
  const repliesByRootId = useMemo(() => {
    const groups = new Map<string, CommentEntry[]>();

    for (const entry of commentEntries) {
      if (!entry.message.parentMessageId) continue;
      groups.set(entry.message.parentMessageId, [...(groups.get(entry.message.parentMessageId) ?? []), entry]);
    }

    for (const [rootMessageId, entries] of groups) {
      groups.set(rootMessageId, entries.sort((left, right) => left.message.createdAt.localeCompare(right.message.createdAt)));
    }

    return groups;
  }, [commentEntries]);
  const activeRootEntry = activeRootMessageId ? rootEntries.find((entry) => entry.message.id === activeRootMessageId) ?? null : null;
  const replyEntries = activeRootEntry ? repliesByRootId.get(activeRootEntry.message.id) ?? [] : [];

  useEffect(() => {
    if (activeRootMessageId && !rootEntries.some((entry) => entry.message.id === activeRootMessageId)) {
      setActiveRootMessageId(null);
      setDraftMode({ type: "default" });
      setBody("");
    }
  }, [activeRootMessageId, rootEntries]);

  const resetDraft = () => {
    setDraftMode({ type: "default" });
    setBody("");
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const value = body.trim();
    if (!value) return;

    if (draftMode.type === "edit") {
      onUpdateComment(draftMode.threadId, draftMode.messageId, value);
    } else {
      const replyInput =
        draftMode.type === "reply"
          ? {
              parentMessageId: draftMode.rootMessageId,
              replyToMessageId: draftMode.targetMessageId === draftMode.rootMessageId ? undefined : draftMode.targetMessageId,
              replyToAuthor: draftMode.targetMessageId === draftMode.rootMessageId ? undefined : draftMode.targetAuthor,
            }
          : activeRootEntry
            ? { parentMessageId: activeRootEntry.message.id }
            : undefined;

      onAddComment(value, replyInput);
    }

    resetDraft();
  };

  const handleReply = (rootMessageId: string, message: CommentMessage) => {
    setSelectedMessageId(message.id);
    setDraftMode({ type: "reply", rootMessageId, targetMessageId: message.id, targetAuthor: message.author });
    setBody("");
  };

  const handleEdit = (threadId: string, message: CommentMessage) => {
    setSelectedMessageId(message.id);
    setDraftMode({ type: "edit", threadId, messageId: message.id, targetAuthor: message.author });
    setBody(message.body);
  };

  const handleDelete = (threadId: string, messageId: string) => {
    const deletingRoot = rootEntries.some((entry) => entry.message.id === messageId);
    if (deletingRoot && activeRootMessageId === messageId) setActiveRootMessageId(null);
    if (selectedMessageId === messageId) setSelectedMessageId(null);
    if (
      (draftMode.type === "reply" && (draftMode.rootMessageId === messageId || draftMode.targetMessageId === messageId)) ||
      (draftMode.type === "edit" && draftMode.messageId === messageId)
    ) {
      resetDraft();
    }
    onDeleteComment(threadId, messageId);
  };

  const openReplyDetail = (entry: CommentEntry) => {
    setActiveRootMessageId(entry.message.id);
    setSelectedMessageId(entry.message.id);
    resetDraft();
  };

  return (
    <aside
      ref={panelDrag.ref}
      style={panelDrag.style}
      data-comment-panel="true"
      className="orf-comment-panel orf-draggable-floating fixed bottom-4 right-4 z-[90] w-[382px] max-w-[calc(100vw-24px)]"
    >
      <div className="orf-comment-box">
        <div className="orf-comment-panel-header orf-drag-handle" {...panelDrag.handleProps}>
          <div className="orf-comment-context-title" title={targetTitle}>{targetTitle}</div>
          <button type="button" className="orf-comment-icon-button" aria-label="关闭评论窗口" title="关闭" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="orf-comment-view">
          {activeRootEntry ? (
            <div className="orf-comment-reply-detail-view">
              <div className="orf-comment-detail-header">
                <button type="button" className="orf-comment-icon-button" aria-label="返回外层评论列表" title="返回" onClick={() => { setActiveRootMessageId(null); resetDraft(); }}>
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <span>回复详情</span>
              </div>
              <div className="orf-comment-fixed-root">
                <CommentMessageRow
                  entry={activeRootEntry}
                  canManageAllComments={canManageAllComments}
                  currentMember={currentMember}
                  selected={selectedMessageId === activeRootEntry.message.id}
                  onSelect={setSelectedMessageId}
                  onReply={(message) => handleReply(activeRootEntry.message.id, message)}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                />
              </div>
              {replyEntries.length > 0 ? (
                <div className="orf-comment-message-list">
                  {replyEntries.map((entry) => (
                    <CommentMessageRow
                      key={`${entry.threadId}:${entry.message.id}`}
                      entry={entry}
                      canManageAllComments={canManageAllComments}
                      currentMember={currentMember}
                      selected={selectedMessageId === entry.message.id}
                      onSelect={setSelectedMessageId}
                      onReply={(message) => handleReply(activeRootEntry.message.id, message)}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              ) : (
                <div className="orf-comment-empty-state">暂无回复</div>
              )}
            </div>
          ) : rootEntries.length > 0 ? (
            <div className="orf-comment-message-list">
              {rootEntries.map((entry) => (
                <CommentMessageRow
                  key={`${entry.threadId}:${entry.message.id}`}
                  entry={entry}
                  canManageAllComments={canManageAllComments}
                  currentMember={currentMember}
                  selected={selectedMessageId === entry.message.id}
                  showReplyEntry
                  onSelect={setSelectedMessageId}
                  onReply={(message) => handleReply(entry.message.id, message)}
                  onEnterReplies={() => openReplyDetail(entry)}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          ) : (
            <div className="orf-comment-empty-state">暂无评论</div>
          )}
        </div>
        <CommentComposer
          body={body}
          currentMember={currentMember}
          defaultReplyAuthor={activeRootEntry?.message.author}
          mode={draftMode}
          onBodyChange={setBody}
          onCancelMode={resetDraft}
          onSubmit={handleSubmit}
          onUploadAttachment={onUploadAttachment}
          targetId={targetId}
          targetType={targetType}
        />
      </div>
    </aside>
  );
}

function CommentMessageRow({
  canManageAllComments,
  currentMember,
  entry,
  onDelete,
  onEdit,
  onEnterReplies,
  onReply,
  onSelect,
  selected,
  showReplyEntry = false,
}: {
  canManageAllComments: boolean;
  currentMember: string;
  entry: CommentEntry;
  onDelete: (threadId: string, messageId: string) => void;
  onEdit: (threadId: string, message: CommentMessage) => void;
  onEnterReplies?: () => void;
  onReply: (message: CommentMessage) => void;
  onSelect: (messageId: string) => void;
  selected: boolean;
  showReplyEntry?: boolean;
}) {
  const { message, threadId } = entry;
  const canManageMessage = canManageAllComments || message.author === currentMember;
  const deleteMessage = () => {
    if (window.confirm("删除这条评论？")) {
      onDelete(threadId, message.id);
    }
  };

  return (
    <article className={clsx("orf-comment-message-row", selected && "orf-comment-message-row-selected")} onClick={() => onSelect(message.id)}>
      <PersonAvatar name={message.author} />
      <div className="orf-comment-message-main">
        <div className="orf-comment-message-header">
          <span className="orf-comment-author-name">{message.author}</span>
          <div className="orf-comment-meta">
            <time>{formatCommentTime(message.createdAt)}</time>
            <button type="button" className="orf-comment-icon-button" aria-label="回复评论" title="回复" onClick={(event) => { event.stopPropagation(); onReply(message); }}>
              <Reply className="h-3.5 w-3.5" />
            </button>
            {canManageMessage && (
              <>
                <button type="button" className="orf-comment-icon-button orf-comment-icon-button-danger" aria-label="删除评论" title="删除" onClick={(event) => { event.stopPropagation(); deleteMessage(); }}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
                <button type="button" className="orf-comment-icon-button" aria-label="编辑评论" title="编辑" onClick={(event) => { event.stopPropagation(); onEdit(threadId, message); }}>
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </>
            )}
          </div>
        </div>
        <div className="orf-comment-body" onDoubleClick={(event) => { event.stopPropagation(); if (canManageMessage) onEdit(threadId, message); }}>
          {message.replyToAuthor && <span className="orf-comment-reply-prefix">回复{message.replyToAuthor}: </span>}
          <CommentBodyText attachments={message.attachments ?? []} body={message.body} />
        </div>
        {showReplyEntry && entry.replyCount > 0 && (
          <button type="button" className="orf-comment-reply-count" onClick={(event) => { event.stopPropagation(); onEnterReplies?.(); }}>
            共 {entry.replyCount} 条回复
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </article>
  );
}

function CommentTextFragment({ value }: { value: string }) {
  return (
    <>
      {parseCommentBodyLinks(value).map((token, index) =>
        token.type === "link" ? (
          <a
            key={`${token.href}:${index}`}
            className="orf-comment-link"
            href={token.href}
            rel="noreferrer noopener"
            target="_blank"
            onClick={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
          >
            {token.value}
          </a>
        ) : (
          <Fragment key={`${token.value}:${index}`}>{token.value}</Fragment>
        ),
      )}
    </>
  );
}

function CommentBodyText({ attachments, body }: { attachments: CommentAttachment[]; body: string }) {
  const attachmentsById = new Map(attachments.map((attachment) => [attachment.id, attachment]));
  const nodes: ReactNode[] = [];
  let lastIndex = 0;

  for (const match of body.matchAll(commentAttachmentTokenPattern)) {
    const token = match[0];
    const alt = match[1] || "评论图片";
    const attachmentId = match[2];
    const index = match.index ?? 0;
    if (index > lastIndex) {
      nodes.push(<CommentTextFragment key={`text:${lastIndex}`} value={body.slice(lastIndex, index)} />);
    }

    const attachment = attachmentId ? attachmentsById.get(attachmentId) : undefined;
    nodes.push(
      attachment ? (
        <figure key={`attachment:${attachment.id}`} className="orf-comment-attachment">
          <img
            className="orf-comment-attachment-image"
            src={attachment.contentUrl}
            alt={alt}
            loading="lazy"
            onClick={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
          />
        </figure>
      ) : (
        <CommentTextFragment key={`missing:${index}`} value={token} />
      ),
    );
    lastIndex = index + token.length;
  }

  if (lastIndex < body.length) {
    nodes.push(<CommentTextFragment key={`text:${lastIndex}`} value={body.slice(lastIndex)} />);
  }

  return <>{nodes}</>;
}

function CommentComposer({
  body,
  currentMember,
  defaultReplyAuthor,
  mode,
  onBodyChange,
  onCancelMode,
  onSubmit,
  onUploadAttachment,
}: {
  body: string;
  currentMember: string;
  defaultReplyAuthor?: string;
  mode: CommentDraftMode;
  onBodyChange: (body: string) => void;
  onCancelMode: () => void;
  onSubmit: (event: FormEvent) => void;
  onUploadAttachment: (file: File) => Promise<string | null>;
  targetId: string;
  targetType: CommentTargetType;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const placeholder = mode.type === "edit" ? "编辑评论..." : mode.type === "reply" ? `回复 ${mode.targetAuthor}...` : defaultReplyAuthor ? "添加回复..." : "添加评论...";
  const submitLabel = mode.type === "edit" ? "保存评论" : mode.type === "reply" || defaultReplyAuthor ? "发送回复" : "发送评论";
  const insertMarkdown = (markdown: string) => {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? body.length;
    const end = textarea?.selectionEnd ?? body.length;
    const before = body.slice(0, start);
    const after = body.slice(end);
    const prefix = before && !before.endsWith("\n") ? "\n" : "";
    const suffix = after && !after.startsWith("\n") ? "\n" : "";
    const nextBody = `${before}${prefix}${markdown}${suffix}${after}`;
    const nextCursor = before.length + prefix.length + markdown.length;
    onBodyChange(nextBody);
    window.requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(nextCursor, nextCursor);
    });
  };
  const uploadImage = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setUploadError("只能上传图片");
      return;
    }

    setUploadingImage(true);
    setUploadError("");
    try {
      const markdown = await onUploadAttachment(file);
      if (markdown) {
        insertMarkdown(markdown);
      } else {
        setUploadError("图片上传失败");
      }
    } finally {
      setUploadingImage(false);
    }
  };
  const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const image = Array.from(event.clipboardData.files).find((file) => file.type.startsWith("image/"));
    if (!image) return;

    event.preventDefault();
    void uploadImage(image);
  };

  return (
    <form className="orf-comment-composer" onSubmit={onSubmit}>
      <PersonAvatar name={currentMember} />
      <div className="orf-comment-composer-main">
        <span className="orf-comment-author-name">{currentMember}</span>
        {mode.type !== "default" && (
          <button type="button" className="orf-comment-draft-target" onClick={onCancelMode}>
            <span>{mode.type === "reply" ? `回复 ${mode.targetAuthor}` : "编辑评论"}</span>
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <textarea
        ref={textareaRef}
        className="orf-comment-compose-field"
        onChange={(event) => onBodyChange(event.target.value)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }
        }}
        onPaste={handlePaste}
        placeholder={placeholder}
        rows={3}
        value={body}
      />
      <div className="orf-comment-composer-footer">
        <span className={clsx("orf-comment-hint", uploadError && "orf-comment-upload-error")}>
          {uploadError || (uploadingImage ? "图片上传中..." : "Ctrl / Cmd + Enter 发送")}
        </span>
        <input
          ref={fileInputRef}
          accept="image/gif,image/jpeg,image/png,image/webp"
          className="hidden"
          type="file"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void uploadImage(file);
          }}
        />
        <button
          type="button"
          className="orf-comment-icon-button"
          disabled={uploadingImage}
          aria-label="添加图片"
          title="添加图片"
          onClick={() => fileInputRef.current?.click()}
        >
          <ImagePlus className="h-4 w-4" />
        </button>
        <button type="submit" className="orf-comment-send-button" disabled={!body.trim() || uploadingImage} aria-label={submitLabel} title={submitLabel}>
          <Send className="h-4 w-4" />
        </button>
      </div>
    </form>
  );
}

function PersonAvatar({ name }: { name: string }) {
  return (
    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white shadow-sm" style={avatarStyleForName(name)} title={name}>
      {initials(name)}
    </div>
  );
}

function formatCommentTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const now = Date.now();
  const diffMinutes = Math.max(0, Math.round((now - date.getTime()) / 60000));
  if (diffMinutes < 1) return "刚刚";
  if (diffMinutes < 60) return `${diffMinutes} 分钟前`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} 小时前`;

  return date.toISOString().slice(0, 10);
}
