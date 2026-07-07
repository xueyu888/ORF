import { ArrowLeft, Bell, BellOff, CheckCircle2, CircleDot, Link as LinkIcon, MessageSquare, Pencil, Reply, RotateCcw, Save, XCircle } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ImagePreviewDialog, type ImagePreview } from "../components/ImagePreviewDialog";
import { Button } from "../components/ui";
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
import { RelatedResourcesPanel } from "../features/drive/RelatedResourcesPanel";
import type { OrfRichTextAttachmentUploadResult } from "../features/rich-text/OrfRichTextEditor";
import { canEditFeedbackMetadata, canManageFeedbackStatus } from "../features/feedback/model/feedbackCapabilities";
import { teamFeedbackCauseOptions } from "../features/feedback/model/feedbackCategories";
import {
  feedbackIssueDisplayId,
  feedbackIssueHref,
  feedbackIssueMarkdownLink,
  feedbackIssueState,
  feedbackIssueStateLabel,
  feedbackIssueThreads,
  isFeedbackIssueOpen,
  nextFeedbackIssueStatus,
} from "../features/feedback/model/feedbackIssue";
import {
  feedbackIssueAssignee,
  feedbackIssueLabels,
  feedbackIssueLinkedFeedback,
  feedbackIssueParticipants,
} from "../features/feedback/model/feedbackIssueMetadata";
import { useOrf } from "../state/OrfProvider";
import { getFeedbackSubscription, updateFeedbackSubscription } from "../state/apiClient";
import type { ActivityItem, CommentMessage, CommentThread, Feedback, FeedbackSubscriptionMode, Impact, OrfProject, OrfUser } from "../types/orf";
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
    updateFeedbackMetadata,
    updateFeedbackStatus,
    uploadCommentAttachment,
  } = useOrf();
  const feedback = state.feedback.find((item) => item.id === feedbackId) ?? null;
  const [draft, setDraft] = useState<CommentDraft>(() => emptyCommentDraft());
  const [draftMode, setDraftMode] = useState<CommentDraftMode>({ type: "default" });
  const [editState, setEditState] = useState<{ draft: CommentDraft; messageId: string; threadId: string } | null>(null);
  const [imagePreview, setImagePreview] = useState<ImagePreview | null>(null);
  const [mentionableUsers, setMentionableUsers] = useState<CommentMentionUser[]>([]);
  const [subscriptionMode, setSubscriptionMode] = useState<FeedbackSubscriptionMode>("none");
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);
  const threads = useMemo(() => feedback ? feedbackIssueThreads(state.comments, feedback.id) : [], [feedback, state.comments]);
  const entries = useMemo(() => feedbackCommentEntries(threads), [threads]);
  const originalEntry = entries[0] ?? null;
  const timelineEntries = originalEntry ? entries.slice(1) : entries;
  const activityEntries = useMemo(() => feedback ? feedbackIssueActivityEntries(feedback.activity) : [], [feedback]);
  const mentionUsersById = useMemo(() => new Map(mentionableUsers.map((user) => [user.id, user])), [mentionableUsers]);
  const canChangeState = feedback ? canManageFeedbackStatus(feedback, currentUser) : false;
  const canEditMetadata = feedback ? canEditFeedbackMetadata(feedback, currentUser) : false;
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

  useEffect(() => {
    if (!feedback || !currentUser) {
      setSubscriptionMode("none");
      return;
    }

    let cancelled = false;
    setSubscriptionLoading(true);
    getFeedbackSubscription(feedback.id)
      .then((response) => {
        if (!cancelled) setSubscriptionMode(response.subscription.mode);
      })
      .catch(() => {
        if (!cancelled) setSubscriptionMode("none");
      })
      .finally(() => {
        if (!cancelled) setSubscriptionLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [currentUser, feedback]);

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
      draft: commentDraftFromStoredBody(entry.message.body, mentionUsersById),
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

  const changeSubscription = async (mode: "none" | "subscribed" | "muted") => {
    if (!feedback || subscriptionLoading) return;
    setSubscriptionLoading(true);
    try {
      const response = await updateFeedbackSubscription(feedback.id, mode);
      setSubscriptionMode(response.subscription.mode);
      notify(subscriptionToast(response.subscription.mode));
    } catch {
      notify("反馈订阅更新失败");
    } finally {
      setSubscriptionLoading(false);
    }
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

          <FeedbackActivityTimeline entries={activityEntries} />

          <div className="feedback-issue-timeline">
            {timelineEntries.map(({ message, thread }) => (
              <article key={`${thread.id}:${message.id}`} className="feedback-issue-comment-card">
                <UserAvatar avatarUrl={message.authorAvatarUrl} className="h-8 w-8 text-[11px] shadow-sm" frame={false} name={message.author} />
                <div className="feedback-issue-comment-main">
                  <div className="feedback-issue-comment-header">
                    <strong>{message.author}</strong>
                    <time dateTime={message.createdAt} title={commentTimeDisplay(message.createdAt).title}>{commentTimeDisplay(message.createdAt).label}</time>
                    {canManageFeedbackComment(message, currentUser, canManageAllComments) && (
                      <Button type="button" size="sm" variant="ghost" onClick={() => startEdit({ message, thread })}>
                        <Pencil aria-hidden="true" />
                        编辑
                      </Button>
                    )}
                    <Button type="button" size="sm" variant="ghost" onClick={() => startReply(message)}>
                      <Reply aria-hidden="true" />
                      回复
                    </Button>
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
          <RelatedResourcesPanel canEdit={Boolean(currentUser)} contextId={feedback.id} contextType="feedback" notify={notify} />
          <FeedbackSubscriptionControls
            disabled={subscriptionLoading}
            mode={subscriptionMode}
            onChange={changeSubscription}
          />
          <IssueSidebar
            canEdit={canEditMetadata}
            comments={threads}
            feedback={feedback}
            feedbackItems={state.feedback}
            onSaveMetadata={(input) => updateFeedbackMetadata(feedback.id, input)}
            projects={state.projects}
            users={state.users}
          />
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
            <Button type="button" size="sm" variant="ghost" onClick={() => onStartEdit(entry)}>
              <Pencil aria-hidden="true" />
              编辑
            </Button>
          )}
          {message && (
            <Button type="button" size="sm" variant="ghost" onClick={() => onReply(message)}>
              <Reply aria-hidden="true" />
              回复
            </Button>
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

function FeedbackSubscriptionControls({
  disabled,
  mode,
  onChange,
}: {
  disabled: boolean;
  mode: FeedbackSubscriptionMode;
  onChange: (mode: "none" | "subscribed" | "muted") => void;
}) {
  const subscribed = mode === "subscribed";
  const muted = mode === "muted";

  return (
    <div className="feedback-issue-sidebar-block">
      <span>Notifications</span>
      <div className="feedback-issue-subscription-state">
        <strong>{feedbackSubscriptionLabel(mode)}</strong>
      </div>
      <div className="feedback-issue-sidebar-actions">
        <Button disabled={disabled} size="sm" type="button" variant={subscribed ? "ghost" : "secondary"} onClick={() => onChange(subscribed ? "none" : "subscribed")}>
          <Bell aria-hidden="true" />
          {subscribed ? "取消关注" : "关注"}
        </Button>
        <Button disabled={disabled} size="sm" type="button" variant={muted ? "secondary" : "ghost"} onClick={() => onChange(muted ? "none" : "muted")}>
          <BellOff aria-hidden="true" />
          {muted ? "取消静音" : "静音"}
        </Button>
      </div>
    </div>
  );
}

type FeedbackMetadataDraft = {
  causeCategories: string[];
  impact: Impact;
  ownerUserId: string;
  phenomenon: string;
  projectId: string;
};

function feedbackMetadataDraftFromFeedback(feedback: Feedback): FeedbackMetadataDraft {
  return {
    causeCategories: feedback.causeCategories,
    impact: feedback.impact,
    ownerUserId: feedback.ownerUserId,
    phenomenon: feedback.phenomenon,
    projectId: feedback.projectId ?? "",
  };
}

function sameFeedbackMetadataDraft(left: FeedbackMetadataDraft, right: FeedbackMetadataDraft) {
  return (
    left.phenomenon === right.phenomenon &&
    left.ownerUserId === right.ownerUserId &&
    left.impact === right.impact &&
    left.projectId === right.projectId &&
    left.causeCategories.length === right.causeCategories.length &&
    left.causeCategories.every((category, index) => category === right.causeCategories[index])
  );
}

function feedbackSubscriptionLabel(mode: FeedbackSubscriptionMode) {
  if (mode === "subscribed") return "已关注";
  if (mode === "muted") return "已静音";
  if (mode === "participating") return "参与中";
  return "未关注";
}

function subscriptionToast(mode: FeedbackSubscriptionMode) {
  if (mode === "subscribed") return "已关注反馈";
  if (mode === "muted") return "已静音反馈";
  if (mode === "participating") return "已恢复参与通知";
  return "已取消反馈关注";
}

function IssueSidebar({
  canEdit,
  comments,
  feedback,
  feedbackItems,
  onSaveMetadata,
  projects,
  users,
}: {
  canEdit: boolean;
  comments: readonly CommentThread[];
  feedback: Feedback;
  feedbackItems: readonly Feedback[];
  onSaveMetadata: (input: {
    causeCategories: string[];
    impact: Impact;
    ownerUserId: string;
    phenomenon: string;
    projectId: string | null;
  }) => Promise<boolean>;
  projects: readonly OrfProject[];
  users: readonly OrfUser[];
}) {
  const [draft, setDraft] = useState(() => feedbackMetadataDraftFromFeedback(feedback));
  const assignee = feedbackIssueAssignee(feedback, users);
  const labels = feedbackIssueLabels(feedback);
  const participants = feedbackIssueParticipants({ feedback, threads: comments, users });
  const linkedFeedback = feedbackIssueLinkedFeedback({ feedback, feedbackItems, threads: comments });
  const activeOwnerOptions = users.filter((user) => user.status === "active");
  const ownerOptions = activeOwnerOptions.length > 0 ? activeOwnerOptions : users;
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const project = feedback.projectId ? projectById.get(feedback.projectId) ?? null : null;
  const causeOptions = useMemo(
    () => Array.from(new Set([...teamFeedbackCauseOptions(), ...feedback.causeCategories])).filter(Boolean),
    [feedback.causeCategories],
  );
  const metadataDirty = !sameFeedbackMetadataDraft(draft, feedbackMetadataDraftFromFeedback(feedback));
  const canSaveMetadata = Boolean(metadataDirty && draft.phenomenon.trim() && draft.ownerUserId.trim() && draft.causeCategories.length > 0);

  useEffect(() => {
    setDraft(feedbackMetadataDraftFromFeedback(feedback));
  }, [feedback.causeCategories, feedback.id, feedback.impact, feedback.ownerUserId, feedback.phenomenon, feedback.projectId]);

  const toggleCause = (cause: string) => {
    setDraft((current) => {
      const exists = current.causeCategories.includes(cause);
      const nextCategories = exists
        ? current.causeCategories.filter((item) => item !== cause)
        : [...current.causeCategories, cause];
      return nextCategories.length > 0 ? { ...current, causeCategories: nextCategories } : current;
    });
  };

  const saveMetadata = async () => {
    if (!canSaveMetadata) return;
    await onSaveMetadata({
      causeCategories: draft.causeCategories,
      impact: draft.impact,
      ownerUserId: draft.ownerUserId,
      phenomenon: draft.phenomenon.trim(),
      projectId: draft.projectId || null,
    });
  };

  return (
    <>
      <div className="feedback-issue-sidebar-block">
        <span>State</span>
        <IssueStateBadge feedback={feedback} />
      </div>
      <div className="feedback-issue-sidebar-block">
        <span>Title</span>
        {canEdit ? (
          <input
            className="feedback-issue-sidebar-input"
            value={draft.phenomenon}
            onChange={(event) => setDraft((current) => ({ ...current, phenomenon: event.target.value }))}
          />
        ) : (
          <strong>{feedback.phenomenon}</strong>
        )}
      </div>
      <div className="feedback-issue-sidebar-block">
        <span>Assignees</span>
        {canEdit ? (
          <select className="feedback-issue-sidebar-input" value={draft.ownerUserId} onChange={(event) => setDraft((current) => ({ ...current, ownerUserId: event.target.value }))}>
            {ownerOptions.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
          </select>
        ) : (
          <div className="feedback-issue-sidebar-person">
            <UserAvatar avatarUrl={assignee.avatarUrl} className="h-7 w-7 text-[10px]" frame={false} name={assignee.name} />
            <strong>{assignee.name}</strong>
          </div>
        )}
      </div>
      <div className="feedback-issue-sidebar-block">
        <span>Labels</span>
        {canEdit ? (
          <div className="feedback-issue-sidebar-choice-list">
            {causeOptions.map((cause) => (
              <label key={cause}>
                <input checked={draft.causeCategories.includes(cause)} type="checkbox" onChange={() => toggleCause(cause)} />
                <span>{cause}</span>
              </label>
            ))}
          </div>
        ) : (
          <div className="feedback-issue-sidebar-labels">
            {labels.map((item) => <BountyBadge key={item.key} tone={item.tone}>{item.name}</BountyBadge>)}
          </div>
        )}
      </div>
      <div className="feedback-issue-sidebar-block">
        <span>Impact</span>
        {canEdit ? (
          <select className="feedback-issue-sidebar-input" value={draft.impact} onChange={(event) => setDraft((current) => ({ ...current, impact: event.target.value as Impact }))}>
            <option value="Critical">{impactLabel.Critical}</option>
            <option value="High">{impactLabel.High}</option>
            <option value="Medium">{impactLabel.Medium}</option>
            <option value="Low">{impactLabel.Low}</option>
          </select>
        ) : (
          <strong>{impactLabel[feedback.impact]}</strong>
        )}
      </div>
      <div className="feedback-issue-sidebar-block">
        <span>Projects</span>
        {canEdit ? (
          <select className="feedback-issue-sidebar-input" value={draft.projectId} onChange={(event) => setDraft((current) => ({ ...current, projectId: event.target.value }))}>
            <option value="">不归属项目</option>
            {projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        ) : project ? (
          <strong>{project.name}</strong>
        ) : (
          <p className="feedback-issue-sidebar-empty">未加入项目</p>
        )}
      </div>
      {canEdit && (
        <div className="feedback-issue-sidebar-block">
          <span>Metadata</span>
          <div className="feedback-issue-sidebar-actions">
            <Button disabled={!canSaveMetadata} size="sm" type="button" onClick={saveMetadata}>
              <Save aria-hidden="true" />
              保存属性
            </Button>
            <Button disabled={!metadataDirty} size="sm" type="button" variant="ghost" onClick={() => setDraft(feedbackMetadataDraftFromFeedback(feedback))}>
              <RotateCcw aria-hidden="true" />
              重置
            </Button>
          </div>
        </div>
      )}
      <div className="feedback-issue-sidebar-block">
        <span>Milestone</span>
        <p className="feedback-issue-sidebar-empty">无里程碑</p>
      </div>
      <div className="feedback-issue-sidebar-block">
        <span>Relationships</span>
        {linkedFeedback.length > 0 ? (
          <div className="feedback-issue-sidebar-links">
            {linkedFeedback.map((item) => (
              <Link key={item.id} to={feedbackIssueHref(item.id)}>
                #{feedbackIssueDisplayId(item.id)} {item.phenomenon}
              </Link>
            ))}
          </div>
        ) : (
          <p className="feedback-issue-sidebar-empty">无关联反馈</p>
        )}
      </div>
      <div className="feedback-issue-sidebar-block">
        <span>Participants</span>
        <div className="feedback-issue-sidebar-participants">
          {participants.map((participant) => (
            <UserAvatar
              key={participant.id ?? participant.name}
              avatarUrl={participant.avatarUrl}
              className="h-7 w-7 text-[10px]"
              frame={false}
              name={participant.name}
            />
          ))}
        </div>
      </div>
      <div className="feedback-issue-sidebar-block">
        <span>Timeline</span>
        <strong>{formatIssueDate(feedback.createdAt)} 创建</strong>
        <strong>{formatIssueDate(feedback.updatedAt)} 更新</strong>
      </div>
    </>
  );
}

function FeedbackActivityTimeline({ entries }: { entries: readonly ActivityItem[] }) {
  if (entries.length === 0) return null;

  return (
    <div className="feedback-issue-event-list" aria-label="反馈活动">
      {entries.map((entry) => (
        <div key={entry.id} className="feedback-issue-event-row">
          <span aria-hidden="true" className="feedback-issue-event-dot" />
          <p>
            <strong>{entry.actor}</strong> {entry.action}
            <time dateTime={entry.at}>{formatIssueDate(entry.at)}</time>
          </p>
        </div>
      ))}
    </div>
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

function feedbackIssueActivityEntries(entries: readonly ActivityItem[]) {
  return [...entries].sort((left, right) => left.at.localeCompare(right.at));
}

function canManageFeedbackComment(message: CommentMessage, currentUser: OrfUser | null, canManageAllComments: boolean) {
  if (canManageAllComments) return true;
  if (!currentUser) return false;
  return message.authorUserId ? message.authorUserId === currentUser.id : message.author === currentUser.name;
}

function formatIssueDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit" }).format(date);
}
