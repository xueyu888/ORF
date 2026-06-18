import { ArrowLeft, ChevronRight, Download, ExternalLink, File as FileIcon, FileText, Pencil, Reply, Send, Trash2, X } from "lucide-react";
import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { clsx } from "clsx";
import { Link } from "react-router-dom";
import { ImagePreviewDialog, type ImagePreview } from "../../../components/ImagePreviewDialog";
import { UserAvatar } from "../../../components/UserAvatar";
import { useDraggableFloating } from "../../../hooks/useDraggableFloating";
import type { CommentAttachment, CommentMessage, CommentTargetType, CommentThread, OrfUser } from "../../../types/orf";
import { OrfRichTextEditor, orfRichTextHasMeaningfulContent, type OrfRichTextAttachmentUploadResult } from "../../rich-text/OrfRichTextEditor";
import {
  orfAttachmentMarkdown,
  type OrfAttachmentReference,
  type OrfMentionReference,
} from "../../rich-text/orfRichTextMarkdown";
import { OrfRichTextMarkdownViewer } from "../../rich-text/OrfRichTextMarkdownViewer";
import { formatFileSize } from "../../../utils/fileSize";
import { commentTimeDisplay } from "./commentTime";

function isInternalCommentHref(href: string) {
  return href.startsWith("/") && !href.startsWith("//");
}

type CommentEntry = {
  message: CommentMessage;
  replyCount: number;
  threadId: string;
};

export type CommentMentionUser = Pick<OrfUser, "avatarUrl" | "email" | "id" | "name" | "role" | "status">;

export type CommentDraft = {
  body: string;
};

export type CommentDraftMode =
  | { type: "default" }
  | { type: "reply"; rootMessageId: string; targetAuthor: string; targetMessageId: string };

export type CommentReplyInput = {
  parentMessageId?: string;
  replyToAuthor?: string;
  replyToMessageId?: string;
};

export function CommentPanel({
  canManageAllComments = false,
  currentMember,
  currentUserAvatarUrl,
  currentUserId,
  onAddComment,
  onClose,
  onDeleteComment,
  onLoadMentionableUsers,
  onUpdateComment,
  onUploadAttachment,
  targetId,
  targetTitle,
  targetType,
  threads,
}: {
  canManageAllComments?: boolean;
  currentMember: string;
  currentUserAvatarUrl?: string | null;
  currentUserId: string;
  onAddComment: (body: string, replyInput?: CommentReplyInput) => void;
  onClose: () => void;
  onDeleteComment: (threadId: string, messageId: string) => void;
  onLoadMentionableUsers: (input: { targetId: string; targetType: CommentTargetType }) => Promise<CommentMentionUser[]>;
  onUpdateComment: (threadId: string, messageId: string, body: string) => void;
  onUploadAttachment: (file: File) => Promise<OrfRichTextAttachmentUploadResult | null>;
  targetId: string;
  targetTitle: string;
  targetType: CommentTargetType;
  threads: CommentThread[];
}) {
  const [draft, setDraft] = useState<CommentDraft>(() => emptyCommentDraft());
  const [draftMode, setDraftMode] = useState<CommentDraftMode>({ type: "default" });
  const [editState, setEditState] = useState<{ draft: CommentDraft; messageId: string; threadId: string } | null>(null);
  const [activeRootMessageId, setActiveRootMessageId] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<ImagePreview | null>(null);
  const [mentionableUsers, setMentionableUsers] = useState<CommentMentionUser[]>([]);
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
  const mentionUsersById = useMemo(() => new Map(mentionableUsers.map((user) => [user.id, user])), [mentionableUsers]);

  useEffect(() => {
    let cancelled = false;
    onLoadMentionableUsers({ targetId, targetType })
      .then((users) => {
        if (!cancelled) setMentionableUsers(users.filter((user) => user.status === "active"));
      })
      .catch(() => {
        if (!cancelled) setMentionableUsers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [onLoadMentionableUsers, targetId, targetType]);

  useEffect(() => {
    if (activeRootMessageId && !rootEntries.some((entry) => entry.message.id === activeRootMessageId)) {
      setActiveRootMessageId(null);
      setDraftMode({ type: "default" });
      setDraft(emptyCommentDraft());
    }
  }, [activeRootMessageId, rootEntries]);

  useEffect(() => {
    setImagePreview(null);
  }, [targetId, targetType]);

  useEffect(() => {
    if (editState && !commentEntries.some((entry) => entry.message.id === editState.messageId)) {
      setEditState(null);
    }
  }, [commentEntries, editState]);

  const resetDraft = () => {
    setDraftMode({ type: "default" });
    setDraft(emptyCommentDraft());
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const value = serializeCommentDraft(draft).trim();
    if (!value) return;

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

    resetDraft();
  };

  const handleReply = (rootMessageId: string, message: CommentMessage) => {
    setSelectedMessageId(message.id);
    setEditState(null);
    setDraftMode({ type: "reply", rootMessageId, targetMessageId: message.id, targetAuthor: message.author });
    setDraft(emptyCommentDraft());
  };

  const handleEdit = (threadId: string, message: CommentMessage) => {
    setSelectedMessageId(message.id);
    resetDraft();
    setEditState({ draft: commentDraftFromStoredBody(message.body), messageId: message.id, threadId });
  };

  const handleDelete = (threadId: string, messageId: string) => {
    const deletingRoot = rootEntries.some((entry) => entry.message.id === messageId);
    if (deletingRoot && activeRootMessageId === messageId) setActiveRootMessageId(null);
    if (selectedMessageId === messageId) setSelectedMessageId(null);
    if (editState?.messageId === messageId) setEditState(null);
    if (draftMode.type === "reply" && (draftMode.rootMessageId === messageId || draftMode.targetMessageId === messageId)) {
      resetDraft();
    }
    onDeleteComment(threadId, messageId);
  };

  const openReplyDetail = (entry: CommentEntry) => {
    setActiveRootMessageId(entry.message.id);
    setSelectedMessageId(entry.message.id);
    setEditState(null);
    resetDraft();
  };
  const updateEditDraft = (messageId: string, draft: CommentDraft) => {
    setEditState((current) => (current?.messageId === messageId ? { ...current, draft } : current));
  };
  const submitEdit = (event: FormEvent, messageId: string) => {
    event.preventDefault();
    if (!editState || editState.messageId !== messageId) return;
    const value = serializeCommentDraft(editState.draft).trim();
    if (!value) return;
    onUpdateComment(editState.threadId, editState.messageId, value);
    setEditState(null);
  };

  return (
    <>
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
                    currentUserId={currentUserId}
                    editDraft={editState?.messageId === activeRootEntry.message.id ? editState.draft : null}
                    mentionUsersById={mentionUsersById}
                    mentionableUsers={mentionableUsers}
                    selected={selectedMessageId === activeRootEntry.message.id}
                    onOpenImage={setImagePreview}
                    onSelect={setSelectedMessageId}
                    onReply={(message) => handleReply(activeRootEntry.message.id, message)}
                    onEdit={handleEdit}
                    onCancelEdit={() => setEditState(null)}
                    onEditDraftChange={(draft) => updateEditDraft(activeRootEntry.message.id, draft)}
                    onSubmitEdit={(event) => submitEdit(event, activeRootEntry.message.id)}
                    onUploadAttachment={onUploadAttachment}
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
                        currentUserId={currentUserId}
                        editDraft={editState?.messageId === entry.message.id ? editState.draft : null}
                        mentionUsersById={mentionUsersById}
                        mentionableUsers={mentionableUsers}
                        selected={selectedMessageId === entry.message.id}
                        onOpenImage={setImagePreview}
                        onSelect={setSelectedMessageId}
                        onReply={(message) => handleReply(activeRootEntry.message.id, message)}
                        onEdit={handleEdit}
                        onCancelEdit={() => setEditState(null)}
                        onEditDraftChange={(draft) => updateEditDraft(entry.message.id, draft)}
                        onSubmitEdit={(event) => submitEdit(event, entry.message.id)}
                        onUploadAttachment={onUploadAttachment}
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
                    currentUserId={currentUserId}
                    editDraft={editState?.messageId === entry.message.id ? editState.draft : null}
                    mentionUsersById={mentionUsersById}
                    mentionableUsers={mentionableUsers}
                    selected={selectedMessageId === entry.message.id}
                    showReplyEntry
                    onOpenImage={setImagePreview}
                    onSelect={setSelectedMessageId}
                    onReply={(message) => handleReply(entry.message.id, message)}
                    onEnterReplies={() => openReplyDetail(entry)}
                    onEdit={handleEdit}
                    onCancelEdit={() => setEditState(null)}
                    onEditDraftChange={(draft) => updateEditDraft(entry.message.id, draft)}
                    onSubmitEdit={(event) => submitEdit(event, entry.message.id)}
                    onUploadAttachment={onUploadAttachment}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            ) : (
              <div className="orf-comment-empty-state">暂无评论</div>
            )}
          </div>
          <CommentComposer
            currentMember={currentMember}
            currentUserAvatarUrl={currentUserAvatarUrl}
            currentUserId={currentUserId}
            defaultReplyAuthor={activeRootEntry?.message.author}
            draft={draft}
            mentionableUsers={mentionableUsers}
            mode={draftMode}
            onCancelMode={resetDraft}
            onDraftChange={setDraft}
            onSubmit={handleSubmit}
            onUploadAttachment={onUploadAttachment}
          />
        </div>
      </aside>
      {imagePreview && <ImagePreviewDialog preview={imagePreview} onClose={() => setImagePreview(null)} />}
    </>
  );
}

function CommentMessageRow({
  canManageAllComments,
  currentMember,
  currentUserId,
  editDraft,
  entry,
  mentionUsersById,
  mentionableUsers,
  onCancelEdit,
  onDelete,
  onEdit,
  onEditDraftChange,
  onEnterReplies,
  onOpenImage,
  onReply,
  onSelect,
  onSubmitEdit,
  onUploadAttachment,
  selected,
  showReplyEntry = false,
}: {
  canManageAllComments: boolean;
  currentMember: string;
  currentUserId: string;
  editDraft: CommentDraft | null;
  entry: CommentEntry;
  mentionUsersById: Map<string, CommentMentionUser>;
  mentionableUsers: CommentMentionUser[];
  onCancelEdit: () => void;
  onDelete: (threadId: string, messageId: string) => void;
  onEdit: (threadId: string, message: CommentMessage) => void;
  onEditDraftChange: (draft: CommentDraft) => void;
  onEnterReplies?: () => void;
  onOpenImage: (preview: ImagePreview) => void;
  onReply: (message: CommentMessage) => void;
  onSelect: (messageId: string) => void;
  onSubmitEdit: (event: FormEvent) => void;
  onUploadAttachment: (file: File) => Promise<OrfRichTextAttachmentUploadResult | null>;
  selected: boolean;
  showReplyEntry?: boolean;
}) {
  const { message, threadId } = entry;
  const canManageMessage = canManageAllComments || (message.authorUserId ? message.authorUserId === currentUserId : message.author === currentMember);
  const createdTime = commentTimeDisplay(message.createdAt);
  const deleteMessage = () => {
    if (window.confirm("删除这条评论？")) {
      onDelete(threadId, message.id);
    }
  };

  return (
    <article className={clsx("orf-comment-message-row", selected && "orf-comment-message-row-selected")} onClick={() => onSelect(message.id)}>
      <PersonAvatar avatarUrl={message.authorAvatarUrl} name={message.author} />
      <div className="orf-comment-message-main">
        <div className="orf-comment-message-header">
          <span className="orf-comment-author-name">{message.author}</span>
          <div className="orf-comment-meta">
            <time dateTime={createdTime.dateTime} title={createdTime.title}>{createdTime.label}</time>
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
        {editDraft ? (
          <CommentInlineEditor
            currentUserId={currentUserId}
            draft={editDraft}
            mentionableUsers={mentionableUsers}
            onCancel={onCancelEdit}
            onDraftChange={onEditDraftChange}
            onSubmit={onSubmitEdit}
            onUploadAttachment={onUploadAttachment}
          />
        ) : (
          <div className="orf-comment-body" onDoubleClick={(event) => { event.stopPropagation(); if (canManageMessage) onEdit(threadId, message); }}>
            {message.replyToAuthor && <span className="orf-comment-reply-prefix">回复{message.replyToAuthor}: </span>}
            <CommentBodyText attachments={message.attachments ?? []} body={message.body} mentionUsersById={mentionUsersById} onOpenImage={onOpenImage} />
          </div>
        )}
        {!editDraft && showReplyEntry && entry.replyCount > 0 && (
          <button type="button" className="orf-comment-reply-count" onClick={(event) => { event.stopPropagation(); onEnterReplies?.(); }}>
            共 {entry.replyCount} 条回复
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </article>
  );
}

export function CommentBodyText({
  attachments,
  body,
  mentionUsersById,
  onOpenImage,
}: {
  attachments: CommentAttachment[];
  body: string;
  mentionUsersById: Map<string, CommentMentionUser>;
  onOpenImage: (preview: ImagePreview) => void;
}) {
  const attachmentsById = new Map(attachments.map((attachment) => [attachment.id, attachment]));
  const renderMention = (reference: OrfMentionReference, key: string) => {
    const user = mentionUsersById.get(reference.userId);
    return user ? (
      <span key={key} className="orf-comment-mention" title={user.email || user.name}>
        @{user.name}
      </span>
    ) : (
      <span key={key} className="orf-comment-mention">
        @{reference.label}
      </span>
    );
  };
  const renderAttachment = (reference: OrfAttachmentReference, key: string) => {
    const attachment = reference.kind === "attached" ? attachmentsById.get(reference.attachmentId) : undefined;
    const alt = reference.alt;
    if (!attachment) {
      return <span key={key}>{orfAttachmentMarkdown(reference)}</span>;
    }

    return attachment.previewKind === "image" ? (
      <figure key={key} className="orf-comment-attachment">
        <button
          type="button"
          className="orf-comment-attachment-preview-button"
          aria-label={`查看图片 ${attachment.fileName || alt}`}
          title="查看图片"
          onClick={(event) => {
            event.stopPropagation();
            onOpenImage({ alt, downloadUrl: attachment.downloadUrl, label: attachment.fileName || alt, src: attachment.contentUrl });
          }}
          onDoubleClick={(event) => event.stopPropagation()}
        >
          <img className="orf-comment-attachment-image" src={attachment.contentUrl} alt={alt} loading="lazy" />
        </button>
      </figure>
    ) : (
      <CommentFileAttachmentCard key={key} attachment={attachment} />
    );
  };

  return (
    <OrfRichTextMarkdownViewer
      body={body}
      classNamePrefix="orf-comment-markdown"
      enableTitleAutolinks
      renderAttachment={renderAttachment}
      renderLink={(href, children, key) => (
        isInternalCommentHref(href) ? (
          <Link
            key={key}
            className="orf-comment-link"
            to={href}
            onClick={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
          >
            {children}
          </Link>
        ) : (
          <a
            key={key}
            className="orf-comment-link"
            href={href}
            rel="noreferrer noopener"
            target="_blank"
            onClick={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
          >
            {children}
          </a>
        )
      )}
      renderMention={renderMention}
      usersById={mentionUsersById}
    />
  );
}

function CommentFileAttachmentCard({ attachment }: { attachment: CommentAttachment }) {
  const canPreview = Boolean(attachment.previewUrl && (attachment.previewKind === "markdown" || attachment.previewKind === "pdf"));
  const fileKindLabel = attachment.previewKind === "markdown"
    ? "Markdown"
    : attachment.previewKind === "pdf"
      ? "PDF"
      : attachment.mimeType || "文件";
  const Icon = attachment.previewKind === "markdown" || attachment.previewKind === "pdf" ? FileText : FileIcon;

  return (
    <figure className="orf-comment-attachment orf-comment-file-attachment">
      <Icon className="orf-comment-file-attachment-icon" aria-hidden="true" />
      <figcaption className="orf-comment-file-attachment-main">
        <span className="orf-comment-file-attachment-name" title={attachment.fileName}>{attachment.fileName}</span>
        <span className="orf-comment-file-attachment-meta">{fileKindLabel} · {formatFileSize(attachment.fileSize)}</span>
      </figcaption>
      <span className="orf-comment-file-attachment-actions">
        {canPreview && (
          <a
            href={attachment.previewUrl ?? attachment.contentUrl}
            target="_blank"
            rel="noreferrer noopener"
            title="预览附件"
            aria-label={`预览附件 ${attachment.fileName}`}
            onClick={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            <span>预览</span>
          </a>
        )}
        <a
          href={attachment.downloadUrl}
          download={attachment.fileName}
          title="下载附件"
          aria-label={`下载附件 ${attachment.fileName}`}
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
        >
          <Download className="h-3.5 w-3.5" />
          <span>下载</span>
        </a>
      </span>
    </figure>
  );
}

export function emptyCommentDraft(): CommentDraft {
  return { body: "" };
}

export function commentDraftFromStoredBody(body: string): CommentDraft {
  return { body };
}

export function serializeCommentDraft(draft: CommentDraft) {
  return draft.body;
}

export function CommentDraftFields({
  autoFocus = false,
  cancelLabel = "取消",
  currentUserId,
  draft,
  idleHint,
  mentionableUsers,
  onCancel,
  onDraftChange,
  onUploadAttachment,
  placeholder,
  showSubmitButton = true,
  submitOnEnter = true,
  submitLabel,
}: {
  autoFocus?: boolean;
  cancelLabel?: string;
  currentUserId: string;
  draft: CommentDraft;
  idleHint?: string;
  mentionableUsers: CommentMentionUser[];
  onCancel?: () => void;
  onDraftChange: (draft: CommentDraft) => void;
  onUploadAttachment: (file: File) => Promise<OrfRichTextAttachmentUploadResult | null>;
  placeholder: string;
  showSubmitButton?: boolean;
  submitOnEnter?: boolean;
  submitLabel: string;
}) {
  const fieldRef = useRef<HTMLDivElement | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const markdownValue = serializeCommentDraft(draft);
  const submitDraftFromEditor = () => {
    if (uploadingImage) return;
    fieldRef.current?.closest("form")?.requestSubmit();
  };

  return (
    <div ref={fieldRef} className="orf-comment-rich-text-field">
      <OrfRichTextEditor
        autoFocus={autoFocus}
        currentUserId={currentUserId}
        idleHint={uploadError || (idleHint ?? "Enter 发送，Shift + Enter 换行")}
        mentionableUsers={mentionableUsers}
        onBusyChange={setUploadingImage}
        onChange={(markdown) => {
          setUploadError("");
          onDraftChange({ body: markdown });
        }}
        onErrorChange={setUploadError}
        onSubmitRequest={submitDraftFromEditor}
        onUploadAttachment={onUploadAttachment}
        placeholder={placeholder}
        submitOnEnter={submitOnEnter}
        value={markdownValue}
        footer={
          <>
        {onCancel && (
          <button type="button" className="orf-comment-icon-button" aria-label={cancelLabel} title={cancelLabel} onClick={onCancel}>
            <X className="h-4 w-4" />
          </button>
        )}
        {showSubmitButton && (
          <button
            type="submit"
            className="orf-comment-send-button"
            disabled={!orfRichTextHasMeaningfulContent(markdownValue) || uploadingImage}
            aria-label={submitLabel}
            title={submitLabel}
          >
            <Send className="h-4 w-4" />
          </button>
        )}
          </>
        }
      />
    </div>
  );
}

export function CommentInlineEditor({
  currentUserId,
  draft,
  mentionableUsers,
  onCancel,
  onDraftChange,
  onSubmit,
  onUploadAttachment,
}: {
  currentUserId: string;
  draft: CommentDraft;
  mentionableUsers: CommentMentionUser[];
  onCancel: () => void;
  onDraftChange: (draft: CommentDraft) => void;
  onSubmit: (event: FormEvent) => void;
  onUploadAttachment: (file: File) => Promise<OrfRichTextAttachmentUploadResult | null>;
}) {
  return (
    <form className="orf-comment-inline-editor" onClick={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()} onSubmit={onSubmit}>
      <CommentDraftFields
        autoFocus
        cancelLabel="取消编辑"
        currentUserId={currentUserId}
        draft={draft}
        mentionableUsers={mentionableUsers}
        onCancel={onCancel}
        onDraftChange={onDraftChange}
        onUploadAttachment={onUploadAttachment}
        placeholder="编辑评论..."
        submitLabel="保存评论"
      />
    </form>
  );
}

export function CommentComposer({
  currentMember,
  currentUserAvatarUrl,
  currentUserId,
  defaultReplyAuthor,
  draft,
  mentionableUsers,
  mode,
  onCancelMode,
  onDraftChange,
  onSubmit,
  onUploadAttachment,
}: {
  currentMember: string;
  currentUserAvatarUrl?: string | null;
  currentUserId: string;
  defaultReplyAuthor?: string;
  draft: CommentDraft;
  mentionableUsers: CommentMentionUser[];
  mode: CommentDraftMode;
  onCancelMode: () => void;
  onDraftChange: (draft: CommentDraft) => void;
  onSubmit: (event: FormEvent) => void;
  onUploadAttachment: (file: File) => Promise<OrfRichTextAttachmentUploadResult | null>;
}) {
  const placeholder = mode.type === "reply" ? `回复 ${mode.targetAuthor}...` : defaultReplyAuthor ? "添加回复..." : "添加评论...";
  const submitLabel = mode.type === "reply" || defaultReplyAuthor ? "发送回复" : "发送评论";

  return (
    <form className="orf-comment-composer" onSubmit={onSubmit}>
      <PersonAvatar avatarUrl={currentUserAvatarUrl} name={currentMember} />
      <div className="orf-comment-composer-main">
        <span className="orf-comment-author-name">{currentMember}</span>
        {mode.type === "reply" && (
          <button type="button" className="orf-comment-draft-target" onClick={onCancelMode}>
            <span>{`回复 ${mode.targetAuthor}`}</span>
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <CommentDraftFields
        currentUserId={currentUserId}
        draft={draft}
        mentionableUsers={mentionableUsers}
        onDraftChange={onDraftChange}
        onUploadAttachment={onUploadAttachment}
        placeholder={placeholder}
        submitLabel={submitLabel}
      />
    </form>
  );
}

function PersonAvatar({ avatarUrl, name }: { avatarUrl?: string | null; name: string }) {
  return <UserAvatar avatarUrl={avatarUrl} className="h-7 w-7 text-[10px] shadow-sm" frame={false} name={name} />;
}
