import {
  ArrowLeft,
  Bell,
  BellOff,
  CheckCircle2,
  CircleDot,
  Link as LinkIcon,
  MessageSquare,
  Pencil,
  Plus,
  Reply,
  RotateCcw,
  Save,
  Send,
  Trash2,
  XCircle,
} from "lucide-react";
import { teamFeedbackCauseOptions, type FeedbackCommandResolution, type FeedbackImpact, type FeedbackPriority, type FeedbackRelationType, type FeedbackTransitionInput } from "../../contracts";
import { feedbackRootPath } from "../../contracts/links";
import { feedbackImpactLabel, feedbackLifecycleLabel, feedbackPriorityLabel, feedbackRelationTypeLabel, feedbackResolutionLabel } from "../../contracts/labels";
import type { FormEvent, MutableRefObject } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { addFeedbackRelation, feedbackMutationFailureMessage, getFeedbackSubscription, markFeedbackViewed, removeFeedbackRelation, transitionFeedback, updateFeedbackAssignee, updateFeedbackMetadata, updateFeedbackSubscription } from "../api";
import { FeedbackBadge, FeedbackButton, FeedbackEmptyState } from "../components/controls";
import {
  feedbackIssueDisplayId,
  feedbackIssueHref,
  feedbackIssueMarkdownLink,
  feedbackIssueState,
  feedbackIssueThreads,
} from "../model/issue";
import {
  ensureFeedbackAssigneeOption,
  type FeedbackAssigneeOption,
} from "../model/assigneeOptions";
import {
  feedbackIssueAssignee,
  feedbackIssueAuthor,
  feedbackIssueLabels,
  feedbackIssueParticipants,
  feedbackIssueRelationSummaries,
} from "../model/issueMetadata";
import { useFeedbackWebHost, type FeedbackCommentDraft, type FeedbackCommentDraftMode, type FeedbackCommentMentionUser, type FeedbackImagePreview } from "../runtime";
import { useFeedbackAssigneeOptions, useFeedbackIssueDetailReadModel, useFeedbackReferenceOptions } from "../hooks";
import type { FeedbackWebActivityItem, FeedbackWebCommentMessage, FeedbackWebCommentThread, FeedbackWebIssue, FeedbackSubscriptionMode, FeedbackReferenceSummary, FeedbackWebProject, FeedbackWebUser } from "../types";

type FeedbackCommentEntry = {
  message: FeedbackWebCommentMessage;
  thread: FeedbackWebCommentThread;
};

type FeedbackMetadataDraft = {
  causeCategories: string[];
  impact: FeedbackImpact;
  priority: "" | FeedbackPriority;
  projectId: string;
  title: string;
};

const lifecycleResolutionOptions: FeedbackCommandResolution[] = ["resolved", "not_needed", "cannot_resolve", "duplicate"];
const feedbackImpactOptions: FeedbackImpact[] = ["low", "medium", "high", "critical"];
const feedbackPriorityOptions: FeedbackPriority[] = ["p0", "p1", "p2", "p3"];
const feedbackRelationOptions: FeedbackRelationType[] = ["related", "duplicates", "blocks"];

export function FeedbackIssuePage() {
  const { feedbackId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const host = useFeedbackWebHost();
  const {
    CommentBodyText,
    CommentComposer,
    CommentInlineEditor,
    ImagePreviewDialog,
    RelatedResourcesPanel,
    UserAvatar,
  } = host.components;
  const {
    addComment,
    canManageAllComments,
    currentUser,
    feedbackInvalidationKey,
    loadCommentMentionableUsers,
    notify,
    updateCommentMessage,
    uploadCommentAttachment,
  } = host.useSession();
  const feedbackReadModel = useFeedbackIssueDetailReadModel(feedbackId, Boolean(currentUser && feedbackId), feedbackInvalidationKey);
  const feedbackData = feedbackReadModel.data;
  const users = feedbackData.users;
  const projects = feedbackData.projects;
  const feedback = feedbackData.feedback.find((item) => item.id === feedbackId) ?? null;
  const relationReferenceIds = useMemo(
    () => feedback ? feedback.relations.map((relation) => feedbackRelationOtherId(feedback.id, relation)).filter((id): id is string => Boolean(id)) : [],
    [feedback],
  );
  const relationReferences = useFeedbackReferenceOptions(
    Boolean(currentUser && feedback),
    `${feedbackInvalidationKey}:${feedback?.id ?? ""}:${feedback?.version ?? ""}`,
    relationReferenceIds,
    80,
  );
  const [draft, setDraft] = useState<FeedbackCommentDraft>(() => host.commentDraft.empty());
  const [draftMode, setDraftMode] = useState<FeedbackCommentDraftMode>({ type: "default" });
  const [editState, setEditState] = useState<{ draft: FeedbackCommentDraft; messageId: string; threadId: string } | null>(null);
  const [imagePreview, setImagePreview] = useState<FeedbackImagePreview | null>(null);
  const [mentionableUsers, setMentionableUsers] = useState<FeedbackCommentMentionUser[]>([]);
  const [subscriptionMode, setSubscriptionMode] = useState<FeedbackSubscriptionMode>("none");
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);
  const commentElementRefs = useRef(new Map<string, HTMLElement>());
  const markedViewSequenceRef = useRef<string | null>(null);
  const assigneeOptions = useFeedbackAssigneeOptions(users, currentUser);
  const threads = useMemo(() => feedback ? feedbackIssueThreads(feedbackData.comments, feedback.id) : [], [feedback, feedbackData.comments]);
  const entries = useMemo(() => feedbackCommentEntries(threads), [threads]);
  const linkedCommentId = useMemo(() => searchParams.get("comment")?.trim() || null, [searchParams]);
  const linkedCommentEntry = useMemo(
    () => linkedCommentId ? feedbackCommentEntryForFocusId(entries, linkedCommentId) : null,
    [entries, linkedCommentId],
  );
  const linkedCommentMessageId = linkedCommentEntry?.message.id ?? null;
  const mentionUsersById = useMemo(() => new Map(mentionableUsers.map((user) => [user.id, user])), [mentionableUsers]);
  const canEditMetadata = Boolean(feedback?.capabilities.canEditReport);
  const canChangeAssignee = Boolean(feedback?.capabilities.canChangeAssignee);
  const refreshFeedbackIssueData = useCallback(() => feedbackReadModel.reload(), [feedbackReadModel.reload]);

  useEffect(() => {
    if (!feedback || feedback.lastActivitySequence <= feedback.lastSeenSequence) return;
    const viewKey = `${feedback.id}:${feedback.lastActivitySequence}`;
    if (markedViewSequenceRef.current === viewKey) return;
    let timeoutId: number | null = null;

    const markVisibleFeedback = () => {
      if (document.visibilityState !== "visible" || markedViewSequenceRef.current === viewKey) return;
      timeoutId = window.setTimeout(() => {
        if (markedViewSequenceRef.current === viewKey) return;
        markedViewSequenceRef.current = viewKey;
        void markFeedbackViewed(feedback.id, feedback.lastActivitySequence)
          .then(refreshFeedbackIssueData)
          .catch(() => {
            if (markedViewSequenceRef.current === viewKey) markedViewSequenceRef.current = null;
          });
      }, 250);
    };

    if (document.visibilityState === "visible") {
      markVisibleFeedback();
    } else {
      document.addEventListener("visibilitychange", markVisibleFeedback, { once: true });
    }

    return () => {
      document.removeEventListener("visibilitychange", markVisibleFeedback);
      if (timeoutId !== null) window.clearTimeout(timeoutId);
    };
  }, [feedback, markFeedbackViewed, refreshFeedbackIssueData]);

  const uploadFeedbackCommentAttachment = async (file: File) => {
    if (!feedback) return null;
    const upload = await uploadCommentAttachment({ file, targetId: feedback.id, targetType: "feedback" });
    return upload ? { markdown: upload.markdown, previewUrl: upload.attachment.contentUrl } : null;
  };

  useEffect(() => {
    setDraft(host.commentDraft.empty());
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
    if (!linkedCommentMessageId) return;

    const frameId = window.requestAnimationFrame(() => {
      const element = commentElementRefs.current.get(linkedCommentMessageId);
      element?.scrollIntoView({ behavior: "smooth", block: "center" });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [linkedCommentMessageId]);

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
    const title = !currentUser || feedbackReadModel.loading
      ? "反馈加载中"
      : feedbackReadModel.error
        ? "反馈读取失败"
        : "没有找到这个反馈";
    const description = feedbackReadModel.error ?? "它可能已经被删除，或者当前账号没有访问权限。";

    return (
      <div className="orf-feedback-workbench feedback-issue-detail-page">
        <FeedbackEmptyState title={title} description={description} />
        <Link className="feedback-issue-back-link" to={feedbackRootPath}>
          <ArrowLeft aria-hidden="true" />
          返回反馈列表
        </Link>
      </div>
    );
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const body = host.commentDraft.serialize(draft).trim();
    if (!body) return;

    const replyInput =
      draftMode.type === "reply"
        ? {
            parentMessageId: draftMode.rootMessageId,
            replyToMessageId: draftMode.targetMessageId === draftMode.rootMessageId ? undefined : draftMode.targetMessageId,
            replyToAuthor: draftMode.targetMessageId === draftMode.rootMessageId ? undefined : draftMode.targetAuthor,
          }
        : undefined;

    const ok = await addComment({
      targetType: "feedback",
      targetId: feedback.id,
      targetTitle: feedback.title,
      body,
      ...replyInput,
    });
    if (!ok) return;
    await refreshFeedbackIssueData();
    setDraft(host.commentDraft.empty());
    setDraftMode({ type: "default" });
  };

  const startReply = (message: FeedbackWebCommentMessage) => {
    setEditState(null);
    setDraft(host.commentDraft.empty());
    setDraftMode({
      type: "reply",
      rootMessageId: message.parentMessageId ?? message.id,
      targetAuthor: message.author,
      targetMessageId: message.id,
    });
  };
  const startEdit = (entry: FeedbackCommentEntry) => {
    setDraft(host.commentDraft.empty());
    setDraftMode({ type: "default" });
    setEditState({
      draft: host.commentDraft.fromStoredBody(entry.message.body, mentionUsersById),
      messageId: entry.message.id,
      threadId: entry.thread.id,
    });
  };
  const updateEditDraft = (messageId: string, nextDraft: FeedbackCommentDraft) => {
    setEditState((current) => (current?.messageId === messageId ? { ...current, draft: nextDraft } : current));
  };
  const submitEdit = async (event: FormEvent, messageId: string) => {
    event.preventDefault();
    if (!editState || editState.messageId !== messageId) return;
    const body = host.commentDraft.serialize(editState.draft).trim();
    if (!body) return;
    const ok = await updateCommentMessage(editState.threadId, editState.messageId, body);
    if (!ok) return;
    await refreshFeedbackIssueData();
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
    if (subscriptionLoading) return;
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

  const runFeedbackMutation = async (operation: () => Promise<void>, successMessage: string, failureMessage: string) => {
    try {
      await operation();
      await refreshFeedbackIssueData();
      notify(successMessage);
      return true;
    } catch (error) {
      notify(feedbackMutationFailureMessage(error, failureMessage));
      return false;
    }
  };

  return (
    <div className="orf-feedback-workbench feedback-issue-detail-page">
      <header className="feedback-issue-detail-header">
        <div className="feedback-issue-detail-title-block">
          <Link className="feedback-issue-back-link" to={feedbackRootPath}>
            <ArrowLeft aria-hidden="true" />
            反馈
          </Link>
          <h2>{feedback.title}</h2>
          <div className="feedback-issue-detail-meta">
            <IssueStateBadge feedback={feedback} />
            <span>#{feedbackIssueDisplayId(feedback.id)}</span>
            <span>更新于 {formatIssueDate(feedback.updatedAt)}</span>
            <span><MessageSquare aria-hidden="true" /> {entries.length}</span>
          </div>
        </div>
        <div className="feedback-issue-detail-actions">
          <FeedbackButton onClick={copyFeedbackLink} variant="secondary">
            <LinkIcon aria-hidden="true" />
            复制链接
          </FeedbackButton>
          <FeedbackButton onClick={() => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" })} variant="secondary">
            <MessageSquare aria-hidden="true" />
            回复
          </FeedbackButton>
        </div>
      </header>

      <main className="feedback-issue-detail-layout">
        <section className="feedback-issue-thread" aria-label="反馈讨论">
          <OriginalFeedbackCard
            feedback={feedback}
            mentionUsersById={mentionUsersById}
            onOpenImage={setImagePreview}
            users={users}
          />

          <FeedbackActivityTimeline entries={feedback.activity} users={users} />

          <div className="feedback-issue-timeline">
            {entries.map(({ message, thread }) => (
              <article
                className={message.id === linkedCommentMessageId ? "feedback-issue-comment-card feedback-issue-comment-card-linked" : "feedback-issue-comment-card"}
                data-comment-message-id={message.id}
                key={`${thread.id}:${message.id}`}
                ref={(element) => registerFeedbackCommentElement(commentElementRefs)(message.id, element)}
              >
                <UserAvatar avatarUrl={message.authorAvatarUrl} className="h-8 w-8 text-[11px] shadow-sm" frame={false} name={message.author} />
                <div className="feedback-issue-comment-main">
                  <div className="feedback-issue-comment-header">
                    <strong>{message.author}</strong>
                    <time dateTime={message.createdAt} title={commentTimeDisplay(message.createdAt).title}>{commentTimeDisplay(message.createdAt).label}</time>
                    {canManageFeedbackComment(message, currentUser, canManageAllComments) && (
                      <FeedbackButton type="button" size="sm" variant="ghost" onClick={() => startEdit({ message, thread })}>
                        <Pencil aria-hidden="true" />
                        编辑
                      </FeedbackButton>
                    )}
                    <FeedbackButton type="button" size="sm" variant="ghost" onClick={() => startReply(message)}>
                      <Reply aria-hidden="true" />
                      回复
                    </FeedbackButton>
                  </div>
                  <div className="feedback-issue-comment-body">
                    {editState?.messageId === message.id ? (
                      <CommentInlineEditor
                        currentUserId={currentUser?.id ?? ""}
                        draft={editState.draft}
                        mentionableUsers={mentionableUsers}
                        onCancel={() => setEditState(null)}
                        onDraftChange={(nextDraft) => updateEditDraft(message.id, nextDraft)}
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
                setDraft(host.commentDraft.empty());
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
          <FeedbackLifecyclePanel
            currentUser={currentUser}
            feedback={feedback}
            notify={notify}
            onTransition={(command) => runFeedbackMutation(
              () => transitionFeedback(feedback.id, command),
              "反馈状态已更新",
              "反馈状态更新失败",
            )}
            relationReferences={relationReferences.references}
          />
          <IssueSidebar
            assigneeOptions={assigneeOptions}
            canChangeAssignee={canChangeAssignee}
            canEdit={canEditMetadata}
            comments={threads}
            feedback={feedback}
            onAddRelation={(input) => runFeedbackMutation(
              () => addFeedbackRelation(feedback.id, { ...input, expectedVersion: feedback.version }),
              "反馈关系已更新",
              "反馈关系更新失败",
            )}
            onRemoveRelation={(relationId) => runFeedbackMutation(
              () => removeFeedbackRelation(feedback.id, relationId, feedback.version),
              "反馈关系已移除",
              "反馈关系移除失败",
            )}
            onSaveAssignee={(assigneeUserId) => runFeedbackMutation(
              () => updateFeedbackAssignee(feedback.id, assigneeUserId, feedback.version),
              "反馈处理人已更新",
              "反馈处理人更新失败",
            )}
            onSaveMetadata={(input) => runFeedbackMutation(
              () => updateFeedbackMetadata(feedback.id, { ...input, expectedVersion: feedback.version }),
              "反馈属性已更新",
              "反馈属性更新失败",
            )}
            projects={projects}
            users={users}
          />
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
  users,
}: {
  feedback: FeedbackWebIssue;
  mentionUsersById: Map<string, FeedbackCommentMentionUser>;
  onOpenImage: (preview: FeedbackImagePreview) => void;
  users: readonly FeedbackWebUser[];
}) {
  const { CommentBodyText, UserAvatar } = useFeedbackWebHost().components;
  const author = feedbackIssueAuthor(feedback, users);
  const createdAt = commentTimeDisplay(feedback.createdAt);

  return (
    <article className="feedback-issue-original-card">
      <UserAvatar avatarUrl={author.avatarUrl} className="h-8 w-8 text-[11px] shadow-sm" frame={false} name={author.name} />
      <div className="feedback-issue-original-main">
        <div className="feedback-issue-comment-header">
          <strong>{author.name}</strong>
          <time dateTime={feedback.createdAt} title={createdAt.title}>{createdAt.label}</time>
        </div>
        <div className="feedback-issue-comment-body">
          <CommentBodyText
            attachments={feedback.reportAttachments}
            body={feedback.description}
            mentionUsersById={mentionUsersById}
            onOpenImage={onOpenImage}
          />
        </div>
      </div>
    </article>
  );
}

function FeedbackLifecyclePanel({
  currentUser,
  feedback,
  notify,
  onTransition,
  relationReferences,
}: {
  currentUser: FeedbackWebUser | null;
  feedback: FeedbackWebIssue;
  notify: (message: string) => void;
  onTransition: (command: FeedbackTransitionInput) => Promise<boolean>;
  relationReferences: readonly FeedbackReferenceSummary[];
}) {
  const [resolution, setResolution] = useState<FeedbackCommandResolution>("resolved");
  const [note, setNote] = useState("");
  const [adminReason, setAdminReason] = useState("");
  const [duplicateTargetFeedbackId, setDuplicateTargetFeedbackId] = useState("");
  const adminTakeoverRequired = currentUser?.role === "admin" && currentUser.id !== feedback.createdBy;
  const capabilities = feedback.capabilities;
  const canRunActiveCommand = capabilities.canSubmitVerification || capabilities.canWithdraw;
  const canRunVerificationCommand = capabilities.canAcceptVerification || capabilities.canRejectVerification;
  const hasLifecycleAction = capabilities.canStart || canRunActiveCommand || canRunVerificationCommand || capabilities.canReopen;
  const noteValue = note.trim();
  const adminReasonValue = adminReason.trim();
  const feedbackTitleById = useMemo(() => new Map(relationReferences.map((item) => [item.id, item.title])), [relationReferences]);
  const duplicateTargets = useMemo(
    () => feedback.relations
      .filter((relation) => relation.type === "duplicates" && relation.sourceFeedbackId === feedback.id)
      .map((relation) => ({
        id: relation.targetFeedbackId,
        title: feedbackTitleById.get(relation.targetFeedbackId) ?? relation.targetFeedbackId,
      })),
    [feedback.id, feedback.relations, feedbackTitleById],
  );

  useEffect(() => {
    setNote("");
    setAdminReason("");
    setDuplicateTargetFeedbackId("");
  }, [feedback.id, feedback.stage, feedback.version]);

  useEffect(() => {
    if (resolution !== "duplicate") return;
    if (duplicateTargetFeedbackId && duplicateTargets.some((item) => item.id === duplicateTargetFeedbackId)) return;
    setDuplicateTargetFeedbackId(duplicateTargets[0]?.id ?? "");
  }, [duplicateTargetFeedbackId, duplicateTargets, resolution]);

  const runTransition = async (type: FeedbackTransitionInput["type"]) => {
    const expectedVersion = feedback.version;
    const administrativeTakeover = adminTakeoverRequired ? { reason: adminReasonValue } : undefined;
    if (adminTakeoverRequired && !adminReasonValue && (type === "accept_verification" || type === "reject_verification" || type === "withdraw" || type === "reopen")) {
      notify("请填写管理员代操作原因");
      return;
    }
    if ((type === "submit_verification" || type === "reject_verification" || type === "withdraw" || type === "reopen") && !noteValue) {
      notify("请填写生命周期说明");
      return;
    }
    if (type === "submit_verification" && resolution === "duplicate" && !duplicateTargetFeedbackId) {
      notify("请先添加并选择重复反馈关系");
      return;
    }

    const command: FeedbackTransitionInput =
      type === "start"
        ? { type, expectedVersion }
        : type === "submit_verification"
          ? {
              type,
              expectedVersion,
              resolution,
              note: noteValue,
              ...(resolution === "duplicate" ? { duplicateTargetFeedbackId } : {}),
            }
          : type === "accept_verification"
            ? { type, expectedVersion, administrativeTakeover }
            : { type, expectedVersion, note: noteValue, administrativeTakeover };

    const ok = await onTransition(command);
    if (ok) {
      setNote("");
      setAdminReason("");
    }
  };

  return (
    <div className="feedback-issue-sidebar-block">
      <span>生命周期</span>
      <IssueStateBadge feedback={feedback} />
      {hasLifecycleAction ? (
        <>
          {feedback.stage === "open" && capabilities.canStart && (
            <FeedbackButton size="sm" type="button" onClick={() => runTransition("start")}>
              <CircleDot aria-hidden="true" />
              开始处理
            </FeedbackButton>
          )}
          {(feedback.stage === "open" || feedback.stage === "in_progress") && canRunActiveCommand && (
            <>
              {capabilities.canSubmitVerification && (
                <>
                  <select className="feedback-issue-sidebar-input" value={resolution} onChange={(event) => setResolution(event.target.value as FeedbackCommandResolution)}>
                    {lifecycleResolutionOptions.map((item) => <option key={item} value={item}>{feedbackResolutionLabel[item]}</option>)}
                  </select>
                  {resolution === "duplicate" && (
                    duplicateTargets.length > 0 ? (
                      <select className="feedback-issue-sidebar-input" value={duplicateTargetFeedbackId} onChange={(event) => setDuplicateTargetFeedbackId(event.target.value)}>
                        {duplicateTargets.map((item) => <option key={item.id} value={item.id}>#{feedbackIssueDisplayId(item.id)} {item.title}</option>)}
                      </select>
                    ) : (
                      <p className="feedback-issue-sidebar-empty">先在关系中添加“重复”目标</p>
                    )
                  )}
                </>
              )}
              {(capabilities.canSubmitVerification || capabilities.canWithdraw) && (
                <textarea
                  className="feedback-issue-sidebar-input"
                  rows={3}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder={capabilities.canSubmitVerification ? "处理说明" : "撤回原因"}
                />
              )}
              <div className="feedback-issue-sidebar-actions">
                {capabilities.canSubmitVerification && (
                  <FeedbackButton size="sm" type="button" onClick={() => runTransition("submit_verification")}>
                    <Send aria-hidden="true" />
                    提交验证
                  </FeedbackButton>
                )}
                {capabilities.canWithdraw && (
                  <FeedbackButton size="sm" type="button" variant="ghost" onClick={() => runTransition("withdraw")}>
                    <XCircle aria-hidden="true" />
                    撤回
                  </FeedbackButton>
                )}
              </div>
            </>
          )}
          {feedback.stage === "pending_verification" && canRunVerificationCommand && (
            <>
              {capabilities.canRejectVerification && (
                <textarea className="feedback-issue-sidebar-input" rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="退回原因" />
              )}
              {adminTakeoverRequired && (
                <textarea className="feedback-issue-sidebar-input" rows={2} value={adminReason} onChange={(event) => setAdminReason(event.target.value)} placeholder="管理员代操作原因" />
              )}
              <div className="feedback-issue-sidebar-actions">
                {capabilities.canAcceptVerification && (
                  <FeedbackButton size="sm" type="button" onClick={() => runTransition("accept_verification")}>
                    <CheckCircle2 aria-hidden="true" />
                    确认关闭
                  </FeedbackButton>
                )}
                {capabilities.canRejectVerification && (
                  <FeedbackButton size="sm" type="button" variant="ghost" onClick={() => runTransition("reject_verification")}>
                    <RotateCcw aria-hidden="true" />
                    退回处理
                  </FeedbackButton>
                )}
              </div>
            </>
          )}
          {feedback.stage === "closed" && capabilities.canReopen && (
            <>
              <textarea className="feedback-issue-sidebar-input" rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="重新打开原因" />
              {adminTakeoverRequired && (
                <textarea className="feedback-issue-sidebar-input" rows={2} value={adminReason} onChange={(event) => setAdminReason(event.target.value)} placeholder="管理员代操作原因" />
              )}
              <FeedbackButton size="sm" type="button" onClick={() => runTransition("reopen")}>
                <RotateCcw aria-hidden="true" />
                重新打开
              </FeedbackButton>
            </>
          )}
        </>
      ) : (
        <p className="feedback-issue-sidebar-empty">当前账号不能推进生命周期</p>
      )}
    </div>
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
      <span>通知</span>
      <div className="feedback-issue-subscription-state">
        <strong>{feedbackSubscriptionLabel(mode)}</strong>
      </div>
      <div className="feedback-issue-sidebar-actions">
        <FeedbackButton disabled={disabled} size="sm" type="button" variant={subscribed ? "ghost" : "secondary"} onClick={() => onChange(subscribed ? "none" : "subscribed")}>
          <Bell aria-hidden="true" />
          {subscribed ? "取消关注" : "关注"}
        </FeedbackButton>
        <FeedbackButton disabled={disabled} size="sm" type="button" variant={muted ? "secondary" : "ghost"} onClick={() => onChange(muted ? "none" : "muted")}>
          <BellOff aria-hidden="true" />
          {muted ? "取消静音" : "静音"}
        </FeedbackButton>
      </div>
    </div>
  );
}

function feedbackMetadataDraftFromFeedback(feedback: FeedbackWebIssue): FeedbackMetadataDraft {
  return {
    causeCategories: feedback.causeCategories,
    impact: feedback.impact,
    priority: feedback.priority ?? "",
    projectId: feedback.projectId ?? "",
    title: feedback.title,
  };
}

function sameFeedbackMetadataDraft(left: FeedbackMetadataDraft, right: FeedbackMetadataDraft) {
  return (
    left.title === right.title &&
    left.impact === right.impact &&
    left.priority === right.priority &&
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
  assigneeOptions,
  canChangeAssignee,
  canEdit,
  comments,
  feedback,
  onAddRelation,
  onRemoveRelation,
  onSaveAssignee,
  onSaveMetadata,
  projects,
  users,
}: {
  assigneeOptions: readonly FeedbackAssigneeOption[];
  canChangeAssignee: boolean;
  canEdit: boolean;
  comments: readonly FeedbackWebCommentThread[];
  feedback: FeedbackWebIssue;
  onAddRelation: (input: { targetFeedbackId: string; type: FeedbackRelationType }) => Promise<boolean>;
  onRemoveRelation: (relationId: string) => Promise<boolean>;
  onSaveAssignee: (assigneeUserId: string | null) => Promise<boolean>;
  onSaveMetadata: (input: {
    causeCategories: string[];
    impact: FeedbackImpact;
    priority: FeedbackPriority | null;
    projectId: string | null;
    title: string;
  }) => Promise<boolean>;
  projects: readonly FeedbackWebProject[];
  users: readonly FeedbackWebUser[];
}) {
  const { UserAvatar } = useFeedbackWebHost().components;
  const [metadataDraft, setMetadataDraft] = useState(() => feedbackMetadataDraftFromFeedback(feedback));
  const [assigneeDraft, setAssigneeDraft] = useState(feedback.assigneeUserId ?? "");
  const [relationDraft, setRelationDraft] = useState<{ targetFeedbackId: string; type: FeedbackRelationType }>({ targetFeedbackId: "", type: "related" });
  const [relationSearch, setRelationSearch] = useState("");
  const assignee = feedbackIssueAssignee(feedback, users);
  const labels = feedbackIssueLabels(feedback);
  const participants = feedbackIssueParticipants({ feedback, threads: comments, users });
  const relationReferenceIds = useMemo(
    () => feedback.relations.map((relation) => feedbackRelationOtherId(feedback.id, relation)).filter((id): id is string => Boolean(id)),
    [feedback.id, feedback.relations],
  );
  const relationReferenceOptions = useFeedbackReferenceOptions(
    Boolean(feedback.id),
    `${feedback.id}:${feedback.version}:${relationSearch}`,
    relationReferenceIds,
    80,
    relationSearch,
  );
  const relationReferences = relationReferenceOptions.references;
  const relationSummaries = feedbackIssueRelationSummaries({ feedback, feedbackReferences: relationReferences });
  const assigneeSelectOptions = useMemo(
    () => ensureFeedbackAssigneeOption(assigneeOptions, assignee.id ? {
      avatarUrl: assignee.avatarUrl,
      id: assignee.id,
      name: assignee.name,
    } : null),
    [assignee.avatarUrl, assignee.id, assignee.name, assigneeOptions],
  );
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const project = feedback.projectId ? projectById.get(feedback.projectId) ?? null : null;
  const causeOptions = useMemo(
    () => Array.from(new Set([...teamFeedbackCauseOptions(), ...feedback.causeCategories])).filter(Boolean),
    [feedback.causeCategories],
  );
  const metadataDirty = !sameFeedbackMetadataDraft(metadataDraft, feedbackMetadataDraftFromFeedback(feedback));
  const assigneeDirty = assigneeDraft !== (feedback.assigneeUserId ?? "");
  const canSaveAssignee = Boolean(canChangeAssignee && assigneeDirty);
  const canSaveMetadata = Boolean(metadataDirty && metadataDraft.title.trim() && metadataDraft.causeCategories.length > 0);
  const relationTargets = useMemo(
    () => relationReferences
      .filter((item) => item.id !== feedback.id)
      .filter((item) => !feedback.relations.some((relation) => feedbackRelationMatchesDraft(feedback.id, relation, item.id, relationDraft.type))),
    [feedback.id, feedback.relations, relationDraft.type, relationReferences],
  );

  useEffect(() => {
    setMetadataDraft(feedbackMetadataDraftFromFeedback(feedback));
  }, [feedback.causeCategories, feedback.id, feedback.impact, feedback.priority, feedback.projectId, feedback.title]);

  useEffect(() => {
    setAssigneeDraft(feedback.assigneeUserId ?? "");
  }, [feedback.assigneeUserId, feedback.id]);

  useEffect(() => {
    setRelationDraft((current) => ({
      ...current,
      targetFeedbackId: relationTargets.some((item) => item.id === current.targetFeedbackId) ? current.targetFeedbackId : "",
    }));
  }, [feedback.id, relationTargets]);

  const toggleCause = (cause: string) => {
    setMetadataDraft((current) => {
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
      causeCategories: metadataDraft.causeCategories,
      impact: metadataDraft.impact,
      priority: metadataDraft.priority || null,
      projectId: metadataDraft.projectId || null,
      title: metadataDraft.title.trim(),
    });
  };

  const saveAssignee = async () => {
    if (!canSaveAssignee) return;
    await onSaveAssignee(assigneeDraft || null);
  };
  const addRelation = async () => {
    if (!canEdit || !relationDraft.targetFeedbackId) return;
    const ok = await onAddRelation(relationDraft);
    if (ok) {
      setRelationDraft((current) => ({ ...current, targetFeedbackId: "" }));
    }
  };

  return (
    <>
      <div className="feedback-issue-sidebar-block">
        <span>标题</span>
        {canEdit ? (
          <input
            className="feedback-issue-sidebar-input"
            value={metadataDraft.title}
            onChange={(event) => setMetadataDraft((current) => ({ ...current, title: event.target.value }))}
          />
        ) : (
          <strong>{feedback.title}</strong>
        )}
      </div>
      <div className="feedback-issue-sidebar-block">
        <span>处理人</span>
        {canChangeAssignee ? (
          <>
            <select className="feedback-issue-sidebar-input" value={assigneeDraft} onChange={(event) => setAssigneeDraft(event.target.value)}>
              <option value="">未指派</option>
              {assigneeSelectOptions.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
            </select>
            <div className="feedback-issue-sidebar-actions">
              <FeedbackButton disabled={!canSaveAssignee} size="sm" type="button" onClick={saveAssignee}>
                <Save aria-hidden="true" />
                保存处理人
              </FeedbackButton>
              <FeedbackButton disabled={!assigneeDirty} size="sm" type="button" variant="ghost" onClick={() => setAssigneeDraft(feedback.assigneeUserId ?? "")}>
                <RotateCcw aria-hidden="true" />
                重置
              </FeedbackButton>
            </div>
          </>
        ) : (
          <div className="feedback-issue-sidebar-person">
            <UserAvatar avatarUrl={assignee.avatarUrl} className="h-7 w-7 text-[10px]" frame={false} name={assignee.name} />
            <strong>{assignee.name}</strong>
          </div>
        )}
      </div>
      <div className="feedback-issue-sidebar-block">
        <span>分类</span>
        {canEdit ? (
          <div className="feedback-issue-sidebar-choice-list">
            {causeOptions.map((cause) => (
              <label key={cause}>
                <input checked={metadataDraft.causeCategories.includes(cause)} type="checkbox" onChange={() => toggleCause(cause)} />
                <span>{cause}</span>
              </label>
            ))}
          </div>
        ) : (
          <div className="feedback-issue-sidebar-labels">
            {labels.map((item) => <FeedbackBadge key={item.key} tone={item.tone}>{item.name}</FeedbackBadge>)}
          </div>
        )}
      </div>
      <div className="feedback-issue-sidebar-block">
        <span>影响</span>
        {canEdit ? (
          <select className="feedback-issue-sidebar-input" value={metadataDraft.impact} onChange={(event) => setMetadataDraft((current) => ({ ...current, impact: event.target.value as FeedbackImpact }))}>
            {feedbackImpactOptions.map((item) => <option key={item} value={item}>{feedbackImpactLabel[item]}</option>)}
          </select>
        ) : (
          <strong>{feedbackImpactLabel[feedback.impact]}</strong>
        )}
      </div>
      <div className="feedback-issue-sidebar-block">
        <span>优先级</span>
        {canEdit ? (
          <select className="feedback-issue-sidebar-input" value={metadataDraft.priority} onChange={(event) => setMetadataDraft((current) => ({ ...current, priority: event.target.value as "" | FeedbackPriority }))}>
            <option value="">未设定</option>
            {feedbackPriorityOptions.map((item) => <option key={item} value={item}>{feedbackPriorityLabel[item]}</option>)}
          </select>
        ) : feedback.priority ? (
          <strong>{feedbackPriorityLabel[feedback.priority]}</strong>
        ) : (
          <p className="feedback-issue-sidebar-empty">未设定</p>
        )}
      </div>
      <div className="feedback-issue-sidebar-block">
        <span>项目</span>
        {canEdit ? (
          <select className="feedback-issue-sidebar-input" value={metadataDraft.projectId} onChange={(event) => setMetadataDraft((current) => ({ ...current, projectId: event.target.value }))}>
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
          <span>属性</span>
          <div className="feedback-issue-sidebar-actions">
            <FeedbackButton disabled={!canSaveMetadata} size="sm" type="button" onClick={saveMetadata}>
              <Save aria-hidden="true" />
              保存属性
            </FeedbackButton>
            <FeedbackButton disabled={!metadataDirty} size="sm" type="button" variant="ghost" onClick={() => setMetadataDraft(feedbackMetadataDraftFromFeedback(feedback))}>
              <RotateCcw aria-hidden="true" />
              重置
            </FeedbackButton>
          </div>
        </div>
      )}
      <div className="feedback-issue-sidebar-block">
        <span>关系</span>
        {relationSummaries.length > 0 ? (
          <div className="feedback-issue-sidebar-links">
            {relationSummaries.map((item) => (
              <div key={item.relationId} className="feedback-issue-sidebar-relation-row">
                <Link to={feedbackIssueHref(item.id)}>
                  #{feedbackIssueDisplayId(item.id)} {item.title}
                </Link>
                <span>{feedbackRelationDirectionLabel(item.type, item.direction)}</span>
                {canEdit && (
                  <FeedbackButton aria-label="移除反馈关系" size="sm" title="移除反馈关系" type="button" variant="ghost" onClick={() => onRemoveRelation(item.relationId)}>
                    <Trash2 aria-hidden="true" />
                  </FeedbackButton>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="feedback-issue-sidebar-empty">无关联反馈</p>
        )}
        {canEdit && (
          <div className="feedback-issue-relation-form">
            <select className="feedback-issue-sidebar-input" value={relationDraft.type} onChange={(event) => setRelationDraft((current) => ({ ...current, type: event.target.value as FeedbackRelationType, targetFeedbackId: "" }))}>
              {feedbackRelationOptions.map((item) => <option key={item} value={item}>{feedbackRelationTypeLabel[item]}</option>)}
            </select>
            <input
              className="feedback-issue-sidebar-input"
              placeholder="搜索反馈标题或编号"
              value={relationSearch}
              onChange={(event) => setRelationSearch(event.target.value)}
            />
            <select className="feedback-issue-sidebar-input" value={relationDraft.targetFeedbackId} onChange={(event) => setRelationDraft((current) => ({ ...current, targetFeedbackId: event.target.value }))}>
              <option value="">{relationReferenceOptions.loading ? "正在读取反馈" : "选择反馈"}</option>
              {relationTargets.map((item) => <option key={item.id} value={item.id}>#{feedbackIssueDisplayId(item.id)} {item.title}</option>)}
            </select>
            {relationReferenceOptions.error && <p className="feedback-issue-sidebar-empty">反馈候选读取失败</p>}
            <FeedbackButton disabled={!relationDraft.targetFeedbackId} size="sm" type="button" onClick={addRelation}>
              <Plus aria-hidden="true" />
              添加关系
            </FeedbackButton>
          </div>
        )}
      </div>
      <div className="feedback-issue-sidebar-block">
        <span>参与者</span>
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
        <span>时间线</span>
        <strong>{formatIssueDate(feedback.createdAt)} 创建</strong>
        <strong>{formatIssueDate(feedback.updatedAt)} 更新</strong>
      </div>
    </>
  );
}

function FeedbackActivityTimeline({ entries, users }: { entries: readonly FeedbackWebActivityItem[]; users: readonly FeedbackWebUser[] }) {
  if (entries.length === 0) return null;
  const userById = new Map(users.map((user) => [user.id, user]));

  return (
    <div className="feedback-issue-event-list" aria-label="反馈活动">
      {[...entries].sort((left, right) => left.sequence - right.sequence).map((entry) => (
        <div key={entry.id} className="feedback-issue-event-row">
          <span aria-hidden="true" className="feedback-issue-event-dot" />
          <p>
            <strong>{entry.actorUserId ? userById.get(entry.actorUserId)?.name ?? "未知成员" : "系统"}</strong> {feedbackActivityLabel(entry)}
            <time dateTime={entry.at}>{formatIssueDate(entry.at)}</time>
          </p>
        </div>
      ))}
    </div>
  );
}

function feedbackActivityLabel(entry: FeedbackWebActivityItem) {
  if (entry.activityType === "feedback.created") return "创建了反馈";
  if (entry.activityType === "feedback.report.changed") return "更新了原始报告";
  if (entry.activityType === "feedback.metadata.changed") return "更新了反馈属性";
  if (entry.activityType === "feedback.assignee.changed") return "更新了处理人";
  if (entry.activityType === "feedback.lifecycle.changed") return "推进了生命周期";
  if (entry.activityType === "feedback.comment.created") return "回复了反馈";
  if (entry.activityType === "feedback.comment.edited") return "编辑了回复";
  if (entry.activityType === "feedback.relation.added") return "添加了关联";
  if (entry.activityType === "feedback.relation.removed") return "移除了关联";
  return "导入了反馈";
}

function feedbackRelationOtherId(feedbackId: string, relation: FeedbackWebIssue["relations"][number]) {
  if (relation.sourceFeedbackId === feedbackId) return relation.targetFeedbackId;
  if (relation.targetFeedbackId === feedbackId) return relation.sourceFeedbackId;
  return null;
}

function feedbackRelationMatchesDraft(
  feedbackId: string,
  relation: FeedbackWebIssue["relations"][number],
  targetFeedbackId: string,
  type: FeedbackRelationType,
) {
  if (relation.type !== type) return false;
  if (type === "related") return feedbackRelationOtherId(feedbackId, relation) === targetFeedbackId;
  return relation.sourceFeedbackId === feedbackId && relation.targetFeedbackId === targetFeedbackId;
}

function feedbackRelationDirectionLabel(type: FeedbackRelationType, direction: "incoming" | "outgoing" | "undirected") {
  if (type === "related") return "相关";
  if (type === "duplicates") return direction === "outgoing" ? "重复于" : "被标记重复";
  return direction === "outgoing" ? "阻塞" : "被阻塞";
}

function IssueStateBadge({ feedback }: { feedback: FeedbackWebIssue }) {
  const state = feedbackIssueState(feedback);
  return (
    <span className="feedback-issue-state-badge" data-state={state}>
      {state === "open" ? <CircleDot aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}
      {feedbackLifecycleLabel(feedback)}
    </span>
  );
}

function feedbackCommentEntries(threads: readonly FeedbackWebCommentThread[]): FeedbackCommentEntry[] {
  return threads
    .flatMap((thread) => thread.messages.map((message) => ({ message, thread })))
    .sort((left, right) => left.message.createdAt.localeCompare(right.message.createdAt));
}

function feedbackCommentEntryForFocusId(entries: readonly FeedbackCommentEntry[], focusedId: string) {
  return (
    entries.find((entry) => entry.message.id === focusedId) ??
    entries.find((entry) => entry.thread.id === focusedId && !entry.message.parentMessageId) ??
    entries.find((entry) => entry.thread.id === focusedId) ??
    null
  );
}

function registerFeedbackCommentElement(ref: MutableRefObject<Map<string, HTMLElement>>) {
  return (messageId: string, element: HTMLElement | null) => {
    if (element) ref.current.set(messageId, element);
    else ref.current.delete(messageId);
  };
}

function canManageFeedbackComment(message: FeedbackWebCommentMessage, currentUser: FeedbackWebUser | null, canManageAllComments: boolean) {
  if (canManageAllComments) return true;
  if (!currentUser) return false;
  return message.authorUserId ? message.authorUserId === currentUser.id : message.author === currentUser.name;
}

function commentTimeDisplay(value: string, referenceNow = Date.now()) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return { label: value };
  }

  const title = formatLocalDateTimeMinute(date);
  const diffMinutes = Math.max(0, Math.floor((referenceNow - date.getTime()) / 60000));
  if (diffMinutes < 1) return { label: "刚刚", title };
  if (diffMinutes < 60) return { label: `${diffMinutes} 分钟前`, title };
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return { label: `${diffHours} 小时前`, title };
  return { label: title, title };
}

function formatLocalDateTimeMinute(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

function formatIssueDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit" }).format(date);
}
