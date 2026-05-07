import { ArrowLeft, ChevronRight, Pencil, Reply, Send, Trash2, X } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { clsx } from "clsx";
import { useDraggableFloating } from "../../../hooks/useDraggableFloating";
import type { CommentMessage, CommentThread } from "../../../types/orf";
import { avatarStyleForName } from "../../../utils/avatar";
import { initials } from "../../../utils/format";

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

export function CommentPanel({
  currentMember,
  onAddComment,
  onClose,
  onDeleteComment,
  onUpdateComment,
  targetTitle,
  threads,
}: {
  currentMember: string;
  onAddComment: (body: string, replyInput?: CommentReplyInput) => void;
  onClose: () => void;
  onDeleteComment: (threadId: string, messageId: string) => void;
  onUpdateComment: (threadId: string, messageId: string, body: string) => void;
  targetTitle: string;
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
        />
      </div>
    </aside>
  );
}

function CommentMessageRow({
  entry,
  onDelete,
  onEdit,
  onEnterReplies,
  onReply,
  onSelect,
  selected,
  showReplyEntry = false,
}: {
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
            <button type="button" className="orf-comment-icon-button orf-comment-icon-button-danger" aria-label="删除评论" title="删除" onClick={(event) => { event.stopPropagation(); deleteMessage(); }}>
              <Trash2 className="h-3.5 w-3.5" />
            </button>
            <button type="button" className="orf-comment-icon-button" aria-label="编辑评论" title="编辑" onClick={(event) => { event.stopPropagation(); onEdit(threadId, message); }}>
              <Pencil className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <p className="orf-comment-body" onDoubleClick={(event) => { event.stopPropagation(); onEdit(threadId, message); }}>
          {message.replyToAuthor && <span className="orf-comment-reply-prefix">回复{message.replyToAuthor}: </span>}
          {message.body}
        </p>
        {showReplyEntry && (
          <button type="button" className="orf-comment-reply-count" onClick={(event) => { event.stopPropagation(); onEnterReplies?.(); }}>
            共 {entry.replyCount} 条回复
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </article>
  );
}

function CommentComposer({
  body,
  currentMember,
  defaultReplyAuthor,
  mode,
  onBodyChange,
  onCancelMode,
  onSubmit,
}: {
  body: string;
  currentMember: string;
  defaultReplyAuthor?: string;
  mode: CommentDraftMode;
  onBodyChange: (body: string) => void;
  onCancelMode: () => void;
  onSubmit: (event: FormEvent) => void;
}) {
  const placeholder = mode.type === "edit" ? "编辑评论..." : mode.type === "reply" ? `回复 ${mode.targetAuthor}...` : defaultReplyAuthor ? "添加回复..." : "添加评论...";
  const submitLabel = mode.type === "edit" ? "保存评论" : mode.type === "reply" || defaultReplyAuthor ? "发送回复" : "发送评论";

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
        className="orf-comment-compose-field"
        onChange={(event) => onBodyChange(event.target.value)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }
        }}
        placeholder={placeholder}
        rows={3}
        value={body}
      />
      <div className="orf-comment-composer-footer">
        <span className="orf-comment-hint">Ctrl / Cmd + Enter 发送</span>
        <button type="submit" className="orf-comment-send-button" disabled={!body.trim()} aria-label={submitLabel} title={submitLabel}>
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
