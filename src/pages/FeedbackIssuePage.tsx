import { ArrowLeft, CheckCircle2, CircleDot, Link as LinkIcon, MessageSquare, Pencil, Reply, RotateCcw, XCircle } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ImagePreviewDialog, type ImagePreview } from "../components/ImagePreviewDialog";
import { UserAvatar } from "../components/UserAvatar";
import { hasPermission } from "../config/permissions";
import { BountyBadge, BountyButton, BountyEmptyState } from "../features/bounty-hall/BountyHallSkin";
import {
  CommentBodyText,
  CommentComposer,
  CommentInlineEditor,
  type CommentDraft,
  type CommentDraftMode,
  type CommentMentionUser,
  commentDraftFromStoredBody,
  emptyCommentDraft,
  serializeCommentDraft,
} from "../features/challenge/comments/CommentPanel";
import { commentTimeDisplay } from "../features/challenge/comments/commentTime";
import type { OrfRichTextAttachmentUploadResult } from "../features/rich-text/OrfRichTextEditor";
import { canManageFeedbackStatus } from "../features/feedback/model/feedbackCapabilities";
import {
  feedbackIssueDisplayId,
  feedbackIssueMarkdownLink,
  feedbackIssueState,
  feedbackIssueStateLabel,
  feedbackIssueThreads,
  isFeedbackIssueOpen,
  nextFeedbackIssueStatus,
} from "../features/feedback/model/feedbackIssue";
import { useOrf } from "../state/OrfProvider";
import type { CommentMessage, CommentThread, Feedback, Impact, OrfUser } from "../types/orf";
import { impactLabel } from "../utils/labels";

type FeedbackCommentEntry = {
  message: CommentMessage;
  thread: CommentThread;
};

export function FeedbackIssuePage() {
  const { feedbackId = "" } = useParams();
  const {
    addComment,
    currentUser,
    loadCommentMentionableUsers,
    notify,
    state,
    updateCommentMessage,
    updateFeedbackStatus,
    uploadCommentAttachment,
  } = useOrf();
  const feedback = state.feedback.find((item) => item.id === feedbackId) ?? null;
  const [draft, setDraft] = useState<CommentDraft>(() => emptyCommentDraft());
  const [draftMode, setDraftMode] = useState<CommentDraftMode>({ type: "default" });
  const [editState, setEditState] = useState<{ draft: CommentDraft; messageId: string; threadId: string } | null>(null);
  const [imagePreview, setImagePreview] = useState<ImagePreview | null>(null);
  const [mentionableUsers, setMentionableUsers] = useState<CommentMentionUser[]>([]);
  const threads = useMemo(() => feedback ? feedbackIssueThreads(state.comments, feedback.id) : [], [feedback, state.comments]);
  const entries = useMemo(() => feedbackCommentEntries(threads), [threads]);
  const originalEntry = entries[0] ?? null;
  const timelineEntries = originalEntry ? entries.slice(1) : entries;
  const mentionUsersById = useMemo(() => new Map(mentionableUsers.map((user) => [user.id, user])), [mentionableUsers]);
  const canChangeState = feedback ? canManageFeedbackStatus(feedback, currentUser) : false;
  const canManageAllComments = hasPermission(currentUser, state.permissionRules, "comment.manage");
  const uploadFeedbackCommentAttachment = async (file: File) => {
    if (!feedback) return null;
    const upload = await uploadCommentAttachment({ file, targetId: feedback.id, targetType: "feedback" });
    return upload ? { markdown: upload.markdown, previewUrl: upload.attachment.contentUrl } : null;
  };

  useEffect(() => {
    setDraft(emptyCommentDraft());
    setDraftMode({ type: "default" });
    setEditState(null);
    setImagePreview(null);
  }, [feedbackId]);

  useEffect(() => {
    if (editState && !entries.some((entry) => entry.message.id === editState.messageId)) {
      setEditState(null);
    }
  }, [editState, entries]);

  useEffect(() => {
    if (!feedback) {
      setMentionableUsers([]);
      return;
    }

    let cancelled = false;
    loadCommentMentionableUsers({ targetId: feedback.id, targetType: "feedback" })
      .then((users) => {
        if (!cancelled) setMentionableUsers(users.filter((user) => user.status === "active"));
      })
      .catch(() => {
        if (!cancelled) setMentionableUsers([]);
      });

    return () => {
      cancelled = true;
    };
  }, [feedback, loadCommentMentionableUsers]);

  if (!feedback) {
    return (
      <div className="bounty-hall-page feedback-issue-detail-page">
        <BountyEmptyState title="没有找到这个反馈" description="它可能已经被删除，或者当前账号没有访问权限。" />
        <Link className="feedback-issue-back-link" to="/feedback">
          <ArrowLeft aria-hidden="true" />
          返回反馈列表
        </Link>
      </div>
    );
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const body = serializeCommentDraft(draft).trim();
    if (!body) return;

    const replyInput =
      draftMode.type === "reply"
        ? {
            parentMessageId: draftMode.rootMessageId,
            replyToMessageId: draftMode.targetMessageId === draftMode.rootMessageId ? undefined : draftMode.targetMessageId,
            replyToAuthor: draftMode.targetMessageId === draftMode.rootMessageId ? undefined : draftMode.targetAuthor,
          }
        : undefined;

    addComment({
      targetType: "feedback",
      targetId: feedback.id,
      targetTitle: feedback.phenomenon,
      body,
      ...replyInput,
    });
    setDraft(emptyCommentDraft());
    setDraftMode({ type: "default" });
  };

  const startReply = (message: CommentMessage) => {
    setEditState(null);
    setDraft(emptyCommentDraft());
    setDraftMode({
      type: "reply",
      rootMessageId: message.parentMessageId ?? message.id,
      targetAuthor: message.author,
      targetMessageId: message.id,
    });
  };
  const startEdit = (entry: FeedbackCommentEntry) => {
    setDraft(emptyCommentDraft());
    setDraftMode({ type: "default" });
    setEditState({
      draft: commentDraftFromStoredBody(entry.message.body),
      messageId: entry.message.id,
      threadId: entry.thread.id,
    });
  };
  const updateEditDraft = (messageId: string, draft: CommentDraft) => {
    setEditState((current) => (current?.messageId === messageId ? { ...current, draft } : current));
  };
  const submitEdit = (event: FormEvent, messageId: string) => {
    event.preventDefault();
    if (!editState || editState.messageId !== messageId) return;
    const body = serializeCommentDraft(editState.draft).trim();
    if (!body) return;
    updateCommentMessage(editState.threadId, editState.messageId, body);
    setEditState(null);
  };

  const copyFeedbackLink = () => {
    const write = navigator.clipboard?.writeText(feedbackIssueMarkdownLink(feedback));
    if (!write) {
      notify("当前浏览器不支持复制链接");
      return;
    }

    void write.then(() => notify("反馈链接已复制")).catch(() => notify("复制链接失败"));
  };

  const issueOpen = isFeedbackIssueOpen(feedback);

  return (
    <div className="bounty-hall-page feedback-issue-detail-page">
      <header className="feedback-issue-detail-header">
        <div className="feedback-issue-detail-title-block">
          <Link className="feedback-issue-back-link" to="/feedback">
            <ArrowLeft aria-hidden="true" />
            反馈
          </Link>
          <h2>{feedback.phenomenon}</h2>
          <div className="feedback-issue-detail-meta">
            <IssueStateBadge feedback={feedback} />
            <span>#{feedbackIssueDisplayId(feedback.id)}</span>
            <span>{feedback.owner} 更新于 {formatIssueDate(feedback.updatedAt)}</span>
            <span><MessageSquare aria-hidden="true" /> {timelineEntries.length}</span>
          </div>
        </div>
        <div className="feedback-issue-detail-actions">
          <BountyButton onClick={copyFeedbackLink} variant="secondary">
            <LinkIcon aria-hidden="true" />
            复制链接
          </BountyButton>
          {canChangeState && (
            <BountyButton onClick={() => updateFeedbackStatus(feedback.id, nextFeedbackIssueStatus(feedback))} variant={issueOpen ? "secondary" : "primary"}>
              {issueOpen ? <XCircle aria-hidden="true" /> : <RotateCcw aria-hidden="true" />}
              {issueOpen ? "关闭 issue" : "重新打开"}
            </BountyButton>
          )}
          <BountyButton onClick={() => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" })} variant="secondary">
            <MessageSquare aria-hidden="true" />
            回复
          </BountyButton>
        </div>
      </header>

      <main className="feedback-issue-detail-layout">
        <section className="feedback-issue-thread" aria-label="反馈讨论">
          <OriginalFeedbackCard
            canManageAllComments={canManageAllComments}
            currentUser={currentUser}
            editState={editState}
            entry={originalEntry}
            feedback={feedback}
            mentionableUsers={mentionableUsers}
            mentionUsersById={mentionUsersById}
            onCancelEdit={() => setEditState(null)}
            onEditDraftChange={updateEditDraft}
            onOpenImage={setImagePreview}
            onReply={startReply}
            onStartEdit={startEdit}
            onSubmitEdit={submitEdit}
            onUploadAttachment={uploadFeedbackCommentAttachment}
          />

          <div className="feedback-issue-timeline">
            {timelineEntries.map(({ message, thread }) => (
              <article key={`${thread.id}:${message.id}`} className="feedback-issue-comment-card">
                <UserAvatar avatarUrl={message.authorAvatarUrl} className="h-8 w-8 text-[11px] shadow-sm" frame={false} name={message.author} />
                <div className="feedback-issue-comment-main">
                  <div className="feedback-issue-comment-header">
                    <strong>{message.author}</strong>
                    <time dateTime={message.createdAt} title={commentTimeDisplay(message.createdAt).title}>{commentTimeDisplay(message.createdAt).label}</time>
                    {canManageFeedbackComment(message, currentUser, canManageAllComments) && (
                      <button type="button" className="feedback-issue-reply-action" onClick={() => startEdit({ message, thread })}>
                        <Pencil aria-hidden="true" />
                        编辑
                      </button>
                    )}
                    <button type="button" className="feedback-issue-reply-action" onClick={() => startReply(message)}>
                      <Reply aria-hidden="true" />
                      回复
                    </button>
                  </div>
                  <div className="feedback-issue-comment-body">
                    {editState?.messageId === message.id ? (
                      <CommentInlineEditor
                        currentUserId={currentUser?.id ?? ""}
                        draft={editState.draft}
                        mentionableUsers={mentionableUsers}
                        onCancel={() => setEditState(null)}
                        onDraftChange={(draft) => updateEditDraft(message.id, draft)}
                        onSubmit={(event) => submitEdit(event, message.id)}
                        onUploadAttachment={uploadFeedbackCommentAttachment}
                      />
                    ) : (
                      <>
                        {message.replyToAuthor && <span className="orf-comment-reply-prefix">回复{message.replyToAuthor}: </span>}
                        <CommentBodyText
                          attachments={message.attachments ?? []}
                          body={message.body}
                          mentionUsersById={mentionUsersById}
                          onOpenImage={setImagePreview}
                        />
                      </>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>

          <div className="feedback-issue-composer">
            <CommentComposer
              currentMember={currentUser?.name ?? "User"}
              currentUserAvatarUrl={currentUser?.avatarUrl}
              currentUserId={currentUser?.id ?? ""}
              draft={draft}
              mentionableUsers={mentionableUsers}
              mode={draftMode}
              onCancelMode={() => {
                setDraft(emptyCommentDraft());
                setDraftMode({ type: "default" });
              }}
              onDraftChange={setDraft}
              onSubmit={handleSubmit}
              onUploadAttachment={uploadFeedbackCommentAttachment}
            />
          </div>
        </section>

        <aside className="feedback-issue-sidebar" aria-label="反馈属性">
          <IssueSidebar feedback={feedback} />
        </aside>
      </main>

      {imagePreview && <ImagePreviewDialog preview={imagePreview} onClose={() => setImagePreview(null)} />}
    </div>
  );
}

function OriginalFeedbackCard({
  canManageAllComments,
  currentUser,
  editState,
  entry,
  feedback,
  mentionableUsers,
  mentionUsersById,
  onEditDraftChange,
  onCancelEdit,
  onOpenImage,
  onReply,
  onStartEdit,
  onSubmitEdit,
  onUploadAttachment,
}: {
  canManageAllComments: boolean;
  currentUser: OrfUser | null;
  editState: { draft: CommentDraft; messageId: string; threadId: string } | null;
  entry: FeedbackCommentEntry | null;
  feedback: Feedback;
  mentionableUsers: CommentMentionUser[];
  mentionUsersById: Map<string, CommentMentionUser>;
  onCancelEdit: () => void;
  onEditDraftChange: (messageId: string, draft: CommentDraft) => void;
  onOpenImage: (preview: ImagePreview) => void;
  onReply: (message: CommentMessage) => void;
  onStartEdit: (entry: FeedbackCommentEntry) => void;
  onSubmitEdit: (event: FormEvent, messageId: string) => void;
  onUploadAttachment: (file: File) => Promise<OrfRichTextAttachmentUploadResult | null>;
}) {
  const message = entry?.message ?? null;
  const createdAt = commentTimeDisplay(message?.createdAt ?? feedback.createdAt);
  const authorName = message?.author ?? feedback.owner;
  const authorAvatarUrl = message?.authorAvatarUrl ?? null;

  return (
    <article className="feedback-issue-original-card">
      <UserAvatar avatarUrl={authorAvatarUrl} className="h-8 w-8 text-[11px] shadow-sm" frame={false} name={authorName} />
      <div className="feedback-issue-original-main">
        <div className="feedback-issue-comment-header">
          <strong>{authorName}</strong>
          <time dateTime={message?.createdAt ?? feedback.createdAt} title={createdAt.title}>{createdAt.label}</time>
          {entry && canManageFeedbackComment(entry.message, currentUser, canManageAllComments) && (
            <button type="button" className="feedback-issue-reply-action" onClick={() => onStartEdit(entry)}>
              <Pencil aria-hidden="true" />
              编辑
            </button>
          )}
          {message && (
            <button type="button" className="feedback-issue-reply-action" onClick={() => onReply(message)}>
              <Reply aria-hidden="true" />
              回复
            </button>
          )}
        </div>
        <div className="feedback-issue-comment-body">
          {message && editState?.messageId === message.id ? (
            <CommentInlineEditor
              currentUserId={currentUser?.id ?? ""}
              draft={editState.draft}
              mentionableUsers={mentionableUsers}
              onCancel={onCancelEdit}
              onDraftChange={(draft) => onEditDraftChange(message.id, draft)}
              onSubmit={(event) => onSubmitEdit(event, message.id)}
              onUploadAttachment={onUploadAttachment}
            />
          ) : message ? (
            <CommentBodyText attachments={message.attachments ?? []} body={message.body} mentionUsersById={mentionUsersById} onOpenImage={onOpenImage} />
          ) : feedback.suggestedAdjustment ? (
            <CommentBodyText attachments={[]} body={feedback.suggestedAdjustment} mentionUsersById={mentionUsersById} onOpenImage={onOpenImage} />
          ) : (
            <CommentBodyText attachments={[]} body={feedback.phenomenon} mentionUsersById={mentionUsersById} onOpenImage={onOpenImage} />
          )}
        </div>
      </div>
    </article>
  );
}

function IssueSidebar({ feedback }: { feedback: Feedback }) {
  return (
    <>
      <div className="feedback-issue-sidebar-block">
        <span>状态</span>
        <IssueStateBadge feedback={feedback} />
      </div>
      <div className="feedback-issue-sidebar-block">
        <span>处理人</span>
        <strong>{feedback.owner}</strong>
      </div>
      <div className="feedback-issue-sidebar-block">
        <span>分类</span>
        <div className="feedback-issue-sidebar-labels">
          {feedback.causeCategories.map((item) => <BountyBadge key={item} tone={causeTone(item)}>{item}</BountyBadge>)}
        </div>
      </div>
      <div className="feedback-issue-sidebar-block">
        <span>影响</span>
        <BountyBadge tone={impactTone(feedback.impact)}>{impactLabel[feedback.impact]}</BountyBadge>
      </div>
      <div className="feedback-issue-sidebar-block">
        <span>时间</span>
        <strong>{formatIssueDate(feedback.createdAt)} 创建</strong>
        <strong>{formatIssueDate(feedback.updatedAt)} 更新</strong>
      </div>
    </>
  );
}

function IssueStateBadge({ feedback }: { feedback: Feedback }) {
  const state = feedbackIssueState(feedback);
  return (
    <span className="feedback-issue-state-badge" data-state={state}>
      {state === "open" ? <CircleDot aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}
      {feedbackIssueStateLabel(feedback)}
    </span>
  );
}

function feedbackCommentEntries(threads: readonly CommentThread[]): FeedbackCommentEntry[] {
  return threads
    .flatMap((thread) => thread.messages.map((message) => ({ message, thread })))
    .sort((left, right) => left.message.createdAt.localeCompare(right.message.createdAt));
}

function canManageFeedbackComment(message: CommentMessage, currentUser: OrfUser | null, canManageAllComments: boolean) {
  if (canManageAllComments) return true;
  if (!currentUser) return false;
  return message.authorUserId ? message.authorUserId === currentUser.id : message.author === currentUser.name;
}

function causeTone(value: string) {
  if (/管理|流程|协作/.test(value)) return "gold" as const;
  if (/技术|系统|质量|缺陷|bug/i.test(value)) return "accent" as const;
  if (/风险|事故|阻塞/.test(value)) return "warning" as const;
  return "neutral" as const;
}

function impactTone(value: Impact) {
  if (value === "Critical") return "danger" as const;
  if (value === "High") return "warning" as const;
  if (value === "Medium") return "accent" as const;
  return "neutral" as const;
}

function formatIssueDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit" }).format(date);
}
