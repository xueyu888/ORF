import { ArrowLeft, CheckCircle2, CircleDot, MessageSquare, Reply, RotateCcw, XCircle } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ImagePreviewDialog, type ImagePreview } from "../components/ImagePreviewDialog";
import { UserAvatar } from "../components/UserAvatar";
import { BountyBadge, BountyButton, BountyEmptyState } from "../features/bounty-hall/BountyHallSkin";
import {
  CommentBodyText,
  CommentComposer,
  type CommentDraft,
  type CommentDraftMode,
  type CommentMentionUser,
  emptyCommentDraft,
  serializeCommentDraft,
} from "../features/challenge/comments/CommentPanel";
import { commentTimeDisplay } from "../features/challenge/comments/commentTime";
import { FeedbackLinkedText } from "../features/feedback/components/FeedbackLinkedText";
import { canManageFeedbackStatus } from "../features/feedback/model/feedbackCapabilities";
import {
  feedbackIssueDisplayId,
  feedbackIssueState,
  feedbackIssueStateLabel,
  feedbackIssueThreads,
  isFeedbackIssueOpen,
  nextFeedbackIssueStatus,
} from "../features/feedback/model/feedbackIssue";
import { useOrf } from "../state/OrfProvider";
import type { CommentMessage, CommentThread, Feedback, Impact } from "../types/orf";
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
    state,
    updateFeedbackStatus,
    uploadCommentAttachment,
  } = useOrf();
  const feedback = state.feedback.find((item) => item.id === feedbackId) ?? null;
  const [draft, setDraft] = useState<CommentDraft>(() => emptyCommentDraft());
  const [draftMode, setDraftMode] = useState<CommentDraftMode>({ type: "default" });
  const [imagePreview, setImagePreview] = useState<ImagePreview | null>(null);
  const [mentionableUsers, setMentionableUsers] = useState<CommentMentionUser[]>([]);
  const threads = useMemo(() => feedback ? feedbackIssueThreads(state.comments, feedback.id) : [], [feedback, state.comments]);
  const entries = useMemo(() => feedbackCommentEntries(threads), [threads]);
  const mentionUsersById = useMemo(() => new Map(mentionableUsers.map((user) => [user.id, user])), [mentionableUsers]);
  const canChangeState = feedback ? canManageFeedbackStatus(feedback, currentUser) : false;

  useEffect(() => {
    setDraft(emptyCommentDraft());
    setDraftMode({ type: "default" });
    setImagePreview(null);
  }, [feedbackId]);

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
    setDraft(emptyCommentDraft());
    setDraftMode({
      type: "reply",
      rootMessageId: message.parentMessageId ?? message.id,
      targetAuthor: message.author,
      targetMessageId: message.id,
    });
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
          <h1>{feedback.phenomenon}</h1>
          <div className="feedback-issue-detail-meta">
            <IssueStateBadge feedback={feedback} />
            <span>#{feedbackIssueDisplayId(feedback.id)}</span>
            <span>{feedback.owner} 更新于 {formatIssueDate(feedback.updatedAt)}</span>
            <span><MessageSquare aria-hidden="true" /> {entries.length}</span>
          </div>
        </div>
        <div className="feedback-issue-detail-actions">
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
          <OriginalFeedbackCard feedback={feedback} mentionUsersById={mentionUsersById} onOpenImage={setImagePreview} />

          <div className="feedback-issue-timeline">
            {entries.map(({ message, thread }) => (
              <article key={`${thread.id}:${message.id}`} className="feedback-issue-comment-card">
                <UserAvatar avatarUrl={message.authorAvatarUrl} className="h-8 w-8 text-[11px] shadow-sm" frame={false} name={message.author} />
                <div className="feedback-issue-comment-main">
                  <div className="feedback-issue-comment-header">
                    <strong>{message.author}</strong>
                    <time dateTime={message.createdAt} title={commentTimeDisplay(message.createdAt).title}>{commentTimeDisplay(message.createdAt).label}</time>
                    <button type="button" className="feedback-issue-reply-action" onClick={() => startReply(message)}>
                      <Reply aria-hidden="true" />
                      回复
                    </button>
                  </div>
                  <div className="feedback-issue-comment-body">
                    {message.replyToAuthor && <span className="orf-comment-reply-prefix">回复{message.replyToAuthor}: </span>}
                    <CommentBodyText
                      attachments={message.attachments ?? []}
                      body={message.body}
                      mentionUsersById={mentionUsersById}
                      onOpenImage={setImagePreview}
                    />
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
              onUploadAttachment={(file) => uploadCommentAttachment({ file, targetId: feedback.id, targetType: "feedback" })}
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
  feedback,
  mentionUsersById,
  onOpenImage,
}: {
  feedback: Feedback;
  mentionUsersById: Map<string, CommentMentionUser>;
  onOpenImage: (preview: ImagePreview) => void;
}) {
  const createdAt = commentTimeDisplay(feedback.createdAt);

  return (
    <article className="feedback-issue-original-card">
      <UserAvatar avatarUrl={null} className="h-8 w-8 text-[11px] shadow-sm" frame={false} name={feedback.owner} />
      <div className="feedback-issue-original-main">
        <div className="feedback-issue-comment-header">
          <strong>{feedback.owner}</strong>
          <time dateTime={feedback.createdAt} title={createdAt.title}>{createdAt.label}</time>
        </div>
        <div className="feedback-issue-comment-body">
          {feedback.suggestedAdjustment ? (
            <FeedbackLinkedText text={feedback.suggestedAdjustment} />
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
