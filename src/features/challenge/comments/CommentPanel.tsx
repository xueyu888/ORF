import { ArrowLeft, ChevronRight, ImagePlus, Pencil, Reply, Send, Trash2, X } from "lucide-react";
import type { ClipboardEvent, FormEvent, KeyboardEvent, ReactNode } from "react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { clsx } from "clsx";
import { ImagePreviewDialog, type ImagePreview } from "../../../components/ImagePreviewDialog";
import { UserAvatar } from "../../../components/UserAvatar";
import { useDraggableFloating } from "../../../hooks/useDraggableFloating";
import type { CommentAttachment, CommentMessage, CommentTargetType, CommentThread, OrfUser } from "../../../types/orf";
import { commentTimeDisplay } from "./commentTime";
import { parseCommentBodyLinks } from "./commentText";

type CommentEntry = {
  message: CommentMessage;
  replyCount: number;
  threadId: string;
};

type CommentMentionUser = Pick<OrfUser, "avatarUrl" | "email" | "id" | "name" | "role" | "status">;

type CommentDraftMention = {
  end: number;
  label: string;
  start: number;
  userId: string;
};

type CommentDraft = {
  mentions: CommentDraftMention[];
  text: string;
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
const commentMentionTokenPattern = /@\[([^\]\n]*)\]\(orf-user:([^) \n]+)\)/g;

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
  onUploadAttachment: (file: File) => Promise<string | null>;
  targetId: string;
  targetTitle: string;
  targetType: CommentTargetType;
  threads: CommentThread[];
}) {
  const [draft, setDraft] = useState<CommentDraft>(() => emptyCommentDraft());
  const [draftMode, setDraftMode] = useState<CommentDraftMode>({ type: "default" });
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

  const resetDraft = () => {
    setDraftMode({ type: "default" });
    setDraft(emptyCommentDraft());
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const value = serializeCommentDraft(draft).trim();
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
    setDraft(emptyCommentDraft());
  };

  const handleEdit = (threadId: string, message: CommentMessage) => {
    setSelectedMessageId(message.id);
    setDraftMode({ type: "edit", threadId, messageId: message.id, targetAuthor: message.author });
    setDraft(commentDraftFromStoredBody(message.body, mentionUsersById));
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
                    mentionUsersById={mentionUsersById}
                    selected={selectedMessageId === activeRootEntry.message.id}
                    onOpenImage={setImagePreview}
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
                        mentionUsersById={mentionUsersById}
                        selected={selectedMessageId === entry.message.id}
                        onOpenImage={setImagePreview}
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
                    mentionUsersById={mentionUsersById}
                    selected={selectedMessageId === entry.message.id}
                    showReplyEntry
                    onOpenImage={setImagePreview}
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
  entry,
  mentionUsersById,
  onDelete,
  onEdit,
  onEnterReplies,
  onOpenImage,
  onReply,
  onSelect,
  selected,
  showReplyEntry = false,
}: {
  canManageAllComments: boolean;
  currentMember: string;
  entry: CommentEntry;
  mentionUsersById: Map<string, CommentMentionUser>;
  onDelete: (threadId: string, messageId: string) => void;
  onEdit: (threadId: string, message: CommentMessage) => void;
  onEnterReplies?: () => void;
  onOpenImage: (preview: ImagePreview) => void;
  onReply: (message: CommentMessage) => void;
  onSelect: (messageId: string) => void;
  selected: boolean;
  showReplyEntry?: boolean;
}) {
  const { message, threadId } = entry;
  const canManageMessage = canManageAllComments || message.author === currentMember;
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
        <div className="orf-comment-body" onDoubleClick={(event) => { event.stopPropagation(); if (canManageMessage) onEdit(threadId, message); }}>
          {message.replyToAuthor && <span className="orf-comment-reply-prefix">回复{message.replyToAuthor}: </span>}
          <CommentBodyText attachments={message.attachments ?? []} body={message.body} mentionUsersById={mentionUsersById} onOpenImage={onOpenImage} />
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

function CommentTextFragment({ mentionUsersById, value }: { mentionUsersById: Map<string, CommentMentionUser>; value: string }) {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;

  for (const match of value.matchAll(commentMentionTokenPattern)) {
    const token = match[0];
    const fallbackLabel = match[1] || "成员";
    const rawUserId = match[2] ?? "";
    const userId = decodeMentionUserId(rawUserId);
    const index = match.index ?? 0;

    if (index > lastIndex) {
      nodes.push(<CommentLinkedText key={`mention-text:${lastIndex}`} value={value.slice(lastIndex, index)} />);
    }

    const user = mentionUsersById.get(userId);
    nodes.push(
      user ? (
        <span key={`mention:${user.id}:${index}`} className="orf-comment-mention" title={user.email || user.name}>
          @{user.name}
        </span>
      ) : (
        <span key={`mention:${rawUserId}:${index}`} className="orf-comment-mention">
          @{fallbackLabel}
        </span>
      ),
    );
    lastIndex = index + token.length;
  }

  if (lastIndex < value.length) {
    nodes.push(<CommentLinkedText key={`mention-text:${lastIndex}`} value={value.slice(lastIndex)} />);
  }

  return <>{nodes}</>;
}

function CommentLinkedText({ value }: { value: string }) {
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

function CommentBodyText({
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
  const nodes: ReactNode[] = [];
  let lastIndex = 0;

  for (const match of body.matchAll(commentAttachmentTokenPattern)) {
    const token = match[0];
    const alt = match[1] || "评论图片";
    const attachmentId = match[2];
    const index = match.index ?? 0;
    if (index > lastIndex) {
      nodes.push(<CommentTextFragment key={`text:${lastIndex}`} mentionUsersById={mentionUsersById} value={body.slice(lastIndex, index)} />);
    }

    const attachment = attachmentId ? attachmentsById.get(attachmentId) : undefined;
    nodes.push(
      attachment ? (
        <figure key={`attachment:${attachment.id}`} className="orf-comment-attachment">
          <button
            type="button"
            className="orf-comment-attachment-preview-button"
            aria-label={`查看图片 ${attachment.fileName || alt}`}
            title="查看图片"
            onClick={(event) => {
              event.stopPropagation();
              onOpenImage({ alt, label: attachment.fileName || alt, src: attachment.contentUrl });
            }}
            onDoubleClick={(event) => event.stopPropagation()}
          >
            <img className="orf-comment-attachment-image" src={attachment.contentUrl} alt={alt} loading="lazy" />
          </button>
        </figure>
      ) : (
        <CommentTextFragment key={`missing:${index}`} mentionUsersById={mentionUsersById} value={token} />
      ),
    );
    lastIndex = index + token.length;
  }

  if (lastIndex < body.length) {
    nodes.push(<CommentTextFragment key={`text:${lastIndex}`} mentionUsersById={mentionUsersById} value={body.slice(lastIndex)} />);
  }

  return <>{nodes}</>;
}

function decodeMentionUserId(rawUserId: string) {
  try {
    return decodeURIComponent(rawUserId);
  } catch {
    return rawUserId;
  }
}

function emptyCommentDraft(): CommentDraft {
  return { mentions: [], text: "" };
}

function commentDraftFromStoredBody(body: string, mentionUsersById: Map<string, CommentMentionUser>): CommentDraft {
  const mentions: CommentDraftMention[] = [];
  let text = "";
  let lastIndex = 0;

  for (const match of body.matchAll(commentMentionTokenPattern)) {
    const token = match[0];
    const fallbackLabel = match[1] || "成员";
    const rawUserId = match[2] ?? "";
    const userId = decodeMentionUserId(rawUserId);
    const index = match.index ?? 0;
    const label = commentMentionLabel(mentionUsersById.get(userId)?.name ?? fallbackLabel);
    const visibleMention = `@${label}`;

    text += body.slice(lastIndex, index);
    const start = text.length;
    text += visibleMention;
    mentions.push({ end: text.length, label, start, userId });
    lastIndex = index + token.length;
  }

  text += body.slice(lastIndex);
  return { mentions, text };
}

function serializeCommentDraft(draft: CommentDraft) {
  const validMentions = draft.mentions
    .filter((mention) => draft.text.slice(mention.start, mention.end) === `@${mention.label}`)
    .sort((left, right) => left.start - right.start);
  let serialized = "";
  let lastIndex = 0;

  for (const mention of validMentions) {
    if (mention.start < lastIndex) continue;
    serialized += draft.text.slice(lastIndex, mention.start);
    serialized += commentMentionTokenForDraftMention(mention);
    lastIndex = mention.end;
  }

  return serialized + draft.text.slice(lastIndex);
}

type CommentMentionRange = {
  end: number;
  query: string;
  start: number;
};

function commentMentionRangeFor(value: string, cursor: number, mentions: CommentDraftMention[]): CommentMentionRange | null {
  if (mentions.some((mention) => cursor > mention.start && cursor <= mention.end)) return null;

  const prefix = value.slice(0, cursor);
  const match = /(^|[\s(（])@([^\s@()[\]]{0,40})$/u.exec(prefix);
  if (!match) return null;
  const query = match[2] ?? "";
  return {
    end: cursor,
    query,
    start: cursor - query.length - 1,
  };
}

function commentMentionTokenForDraftMention(mention: Pick<CommentDraftMention, "label" | "userId">) {
  return `@[${commentMentionLabel(mention.label)}](orf-user:${encodeURIComponent(mention.userId)})`;
}

function commentMentionLabel(name: string) {
  return name.replace(/[\]\r\n]/g, " ").trim() || "成员";
}

function reconcileCommentDraftMentions(previousText: string, nextText: string, mentions: CommentDraftMention[]) {
  let prefixLength = 0;
  const commonPrefixLimit = Math.min(previousText.length, nextText.length);
  while (prefixLength < commonPrefixLimit && previousText[prefixLength] === nextText[prefixLength]) {
    prefixLength += 1;
  }

  let suffixLength = 0;
  const suffixLimit = commonPrefixLimit - prefixLength;
  while (
    suffixLength < suffixLimit &&
    previousText[previousText.length - 1 - suffixLength] === nextText[nextText.length - 1 - suffixLength]
  ) {
    suffixLength += 1;
  }

  const previousEditEnd = previousText.length - suffixLength;
  const nextEditEnd = nextText.length - suffixLength;
  const delta = nextEditEnd - previousEditEnd;

  return mentions
    .flatMap((mention) => {
      if (mention.end <= prefixLength) return [mention];
      if (mention.start >= previousEditEnd) {
        return [{ ...mention, end: mention.end + delta, start: mention.start + delta }];
      }
      return [];
    })
    .filter((mention) => nextText.slice(mention.start, mention.end) === `@${mention.label}`);
}

function replaceCommentDraftText(
  draft: CommentDraft,
  start: number,
  end: number,
  replacement: string,
  mention?: Omit<CommentDraftMention, "end" | "start"> & { length: number },
): CommentDraft {
  const nextText = `${draft.text.slice(0, start)}${replacement}${draft.text.slice(end)}`;
  const delta = replacement.length - (end - start);
  const mentions = draft.mentions.flatMap((entry) => {
    if (entry.end <= start) return [entry];
    if (entry.start >= end) return [{ ...entry, end: entry.end + delta, start: entry.start + delta }];
    return [];
  });

  if (mention) {
    mentions.push({
      end: start + mention.length,
      label: mention.label,
      start,
      userId: mention.userId,
    });
  }

  return {
    mentions: mentions.sort((left, right) => left.start - right.start),
    text: nextText,
  };
}

function CommentComposer({
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
  onUploadAttachment: (file: File) => Promise<string | null>;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [mentionRange, setMentionRange] = useState<CommentMentionRange | null>(null);
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);
  const draftRef = useRef(draft);
  const placeholder = mode.type === "edit" ? "编辑评论..." : mode.type === "reply" ? `回复 ${mode.targetAuthor}...` : defaultReplyAuthor ? "添加回复..." : "添加评论...";
  const submitLabel = mode.type === "edit" ? "保存评论" : mode.type === "reply" || defaultReplyAuthor ? "发送回复" : "发送评论";
  const filteredMentionUsers = useMemo(() => {
    if (!mentionRange) return [];
    const query = mentionRange.query.trim().toLowerCase();
    return mentionableUsers
      .filter((user) => user.id !== currentUserId)
      .filter((user) => !query || user.name.toLowerCase().includes(query) || user.email.toLowerCase().includes(query))
      .slice(0, 6);
  }, [currentUserId, mentionRange, mentionableUsers]);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    setSelectedMentionIndex(0);
  }, [mentionRange?.query, filteredMentionUsers.length]);

  const commitDraftChange = (nextDraft: CommentDraft) => {
    draftRef.current = nextDraft;
    onDraftChange(nextDraft);
  };
  const updateMentionRange = (value: string, cursor: number, mentions = draftRef.current.mentions) => {
    setMentionRange(commentMentionRangeFor(value, cursor, mentions));
  };
  const insertMention = (user: CommentMentionUser, range = mentionRange) => {
    if (!range) return;
    const textarea = textareaRef.current;
    const currentDraft = draftRef.current;
    const after = currentDraft.text.slice(range.end);
    const label = commentMentionLabel(user.name);
    const visibleMention = `@${label}`;
    const suffix = after && /^\s/.test(after) ? "" : " ";
    const nextDraft = replaceCommentDraftText(currentDraft, range.start, range.end, `${visibleMention}${suffix}`, {
      label,
      length: visibleMention.length,
      userId: user.id,
    });
    const nextCursor = range.start + visibleMention.length + suffix.length;
    commitDraftChange(nextDraft);
    setMentionRange(null);
    window.requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(nextCursor, nextCursor);
    });
  };
  const insertMarkdown = (markdown: string) => {
    const textarea = textareaRef.current;
    const currentDraft = draftRef.current;
    const start = Math.max(0, Math.min(textarea?.selectionStart ?? currentDraft.text.length, currentDraft.text.length));
    const end = Math.max(start, Math.min(textarea?.selectionEnd ?? currentDraft.text.length, currentDraft.text.length));
    const before = currentDraft.text.slice(0, start);
    const after = currentDraft.text.slice(end);
    const prefix = before && !before.endsWith("\n") ? "\n" : "";
    const suffix = after && !after.startsWith("\n") ? "\n" : "";
    const nextCursor = before.length + prefix.length + markdown.length;
    commitDraftChange(replaceCommentDraftText(currentDraft, start, end, `${prefix}${markdown}${suffix}`));
    setMentionRange(null);
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
  const handleBodyChange = (value: string, cursor: number) => {
    const currentDraft = draftRef.current;
    const mentions = reconcileCommentDraftMentions(currentDraft.text, value, currentDraft.mentions);
    commitDraftChange({ mentions, text: value });
    updateMentionRange(value, cursor, mentions);
  };
  const submitDraftFromKeyboard = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    event.preventDefault();
    if (uploadingImage) return;
    event.currentTarget.form?.requestSubmit();
  };

  return (
    <form className="orf-comment-composer" onSubmit={onSubmit}>
      <PersonAvatar avatarUrl={currentUserAvatarUrl} name={currentMember} />
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
        onChange={(event) => handleBodyChange(event.target.value, event.currentTarget.selectionStart)}
        onKeyDown={(event) => {
          if (mentionRange && filteredMentionUsers.length > 0) {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setSelectedMentionIndex((index) => (index + 1) % filteredMentionUsers.length);
              return;
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setSelectedMentionIndex((index) => (index - 1 + filteredMentionUsers.length) % filteredMentionUsers.length);
              return;
            }
            if (event.key === "Enter" || event.key === "Tab") {
              event.preventDefault();
              const selectedUser = filteredMentionUsers[selectedMentionIndex] ?? filteredMentionUsers[0];
              if (selectedUser) insertMention(selectedUser);
              return;
            }
          }
          if (mentionRange && event.key === "Escape") {
            event.preventDefault();
            setMentionRange(null);
            return;
          }
          if (event.key === "Enter" && !event.shiftKey && !event.altKey && !event.nativeEvent.isComposing) {
            submitDraftFromKeyboard(event);
            return;
          }
        }}
        onKeyUp={(event) => updateMentionRange(event.currentTarget.value, event.currentTarget.selectionStart)}
        onPaste={handlePaste}
        onSelect={(event) => updateMentionRange(event.currentTarget.value, event.currentTarget.selectionStart)}
        placeholder={placeholder}
        rows={3}
        value={draft.text}
      />
      {mentionRange && (
        <div className="orf-comment-mention-menu">
          {filteredMentionUsers.length > 0 ? (
            filteredMentionUsers.map((user, index) => (
              <button
                key={user.id}
                type="button"
                className={clsx("orf-comment-mention-option", index === selectedMentionIndex && "orf-comment-mention-option-active")}
                onMouseDown={(event) => {
                  event.preventDefault();
                  insertMention(user);
                }}
              >
                <PersonAvatar avatarUrl={user.avatarUrl} name={user.name} />
                <span>
                  <span className="orf-comment-mention-name">{user.name}</span>
                  <span className="orf-comment-mention-email">{user.email}</span>
                </span>
              </button>
            ))
          ) : (
            <div className="orf-comment-mention-empty">没有匹配成员</div>
          )}
        </div>
      )}
      <div className="orf-comment-composer-footer">
        <span className={clsx("orf-comment-hint", uploadError && "orf-comment-upload-error")}>
          {uploadError || (uploadingImage ? "图片上传中..." : "Enter 发送，Shift + Enter 换行")}
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
        <button type="submit" className="orf-comment-send-button" disabled={!draft.text.trim() || uploadingImage} aria-label={submitLabel} title={submitLabel}>
          <Send className="h-4 w-4" />
        </button>
      </div>
    </form>
  );
}

function PersonAvatar({ avatarUrl, name }: { avatarUrl?: string | null; name: string }) {
  return <UserAvatar avatarUrl={avatarUrl} className="h-7 w-7 text-[10px] shadow-sm" frame={false} name={name} />;
}
