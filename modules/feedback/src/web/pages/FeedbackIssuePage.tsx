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
  Save,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { teamFeedbackCauseOptions, type FeedbackImpact, type FeedbackPriority, type FeedbackRelationType } from "../../contracts";
import { feedbackRootPath } from "../../contracts/links";
import { feedbackImpactLabel, feedbackLifecycleLabel, feedbackPriorityLabel, feedbackRelationTypeLabel, feedbackResolutionLabel, feedbackStageLabel } from "../../contracts/labels";
import type { FormEvent, MutableRefObject, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { addFeedbackRelation, feedbackMutationFailureMessage, getFeedbackSubscription, markFeedbackViewed, removeFeedbackRelation, submitFeedbackFollowUp, updateFeedbackMetadata, updateFeedbackReport, updateFeedbackSubscription } from "../api";
import { FeedbackBadge, FeedbackButton, FeedbackEmptyState } from "../components/controls";
import { FeedbackFollowUpControls } from "../components/FeedbackFollowUpControls";
import {
  feedbackIssueDisplayId,
  feedbackIssueHref,
  feedbackIssueMarkdownLink,
  feedbackIssueState,
  feedbackIssueThreads,
} from "../model/issue";
import {
  emptyFeedbackFollowUpDraft,
  feedbackFollowUpLifecycleOptions,
  feedbackFollowUpTransition,
} from "../model/followUp";
import {
  feedbackIssueTimelineEntries,
  type FeedbackTimelineCommentEntry,
} from "../model/timeline";
import {
  feedbackIssueAssignee,
  feedbackIssueAuthor,
  feedbackIssueLabels,
  feedbackIssueParticipants,
  feedbackIssueRelationSummaries,
} from "../model/issueMetadata";
import { useFeedbackWebHost, type FeedbackCommentDraft, type FeedbackCommentDraftMode, type FeedbackCommentMentionUser, type FeedbackImagePreview } from "../runtime";
import { useFeedbackAssigneeOptions, useFeedbackIssueDetailReadModel, useFeedbackReferenceOptions } from "../hooks";
import type { FeedbackWebActivityItem, FeedbackWebCommentMessage, FeedbackWebCommentThread, FeedbackWebIssue, FeedbackSubscriptionMode, FeedbackWebProject, FeedbackWebUser } from "../types";

type FeedbackCommentEntry = FeedbackTimelineCommentEntry;

type FeedbackMetadataDraft = {
  causeCategories: string[];
  impact: FeedbackImpact;
  priority: "" | FeedbackPriority;
  projectId: string;
  title: string;
};

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
  const [followUpDraft, setFollowUpDraft] = useState(emptyFeedbackFollowUpDraft);
  const [followUpSubmitting, setFollowUpSubmitting] = useState(false);
  const [editState, setEditState] = useState<{ draft: FeedbackCommentDraft; messageId: string; threadId: string } | null>(null);
  const [imagePreview, setImagePreview] = useState<FeedbackImagePreview | null>(null);
  const [mentionableUsers, setMentionableUsers] = useState<FeedbackCommentMentionUser[]>([]);
  const [subscriptionMode, setSubscriptionMode] = useState<FeedbackSubscriptionMode>("none");
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const commentElementRefs = useRef(new Map<string, HTMLElement>());
  const markedViewSequenceRef = useRef<string | null>(null);
  const loadMentionableUsersRef = useRef(loadCommentMentionableUsers);
  loadMentionableUsersRef.current = loadCommentMentionableUsers;
  const assigneeOptions = useFeedbackAssigneeOptions(users, currentUser);
  const usersById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);
  const lifecycleOptions = useMemo(() => feedback ? feedbackFollowUpLifecycleOptions(feedback) : [], [feedback]);
  const threads = useMemo(() => feedback ? feedbackIssueThreads(feedbackData.comments, feedback.id) : [], [feedback, feedbackData.comments]);
  const entries = useMemo(() => feedbackCommentEntries(threads), [threads]);
  const timelineEntries = useMemo(
    () => feedback ? feedbackIssueTimelineEntries(feedback.activity, entries) : [],
    [entries, feedback],
  );
  const linkedCommentId = useMemo(() => searchParams.get("comment")?.trim() || null, [searchParams]);
  const linkedCommentEntry = useMemo(
    () => linkedCommentId ? feedbackCommentEntryForFocusId(entries, linkedCommentId) : null,
    [entries, linkedCommentId],
  );
  const linkedCommentMessageId = linkedCommentEntry?.message.id ?? null;
  const mentionUsersById = useMemo(() => new Map(mentionableUsers.map((user) => [user.id, user])), [mentionableUsers]);
  const canEditMetadata = Boolean(feedback?.capabilities.canEditReport);
  const canChangeAssignee = Boolean(feedback?.capabilities.canChangeAssignee);
  const duplicateTargets = useMemo(() => {
    if (!feedback) return [];
    const titleById = new Map(relationReferences.references.map((item) => [item.id, item.title]));
    return feedback.relations
      .filter((relation) => relation.type === "duplicates" && relation.sourceFeedbackId === feedback.id)
      .map((relation) => ({
        id: relation.targetFeedbackId,
        title: `#${feedbackIssueDisplayId(relation.targetFeedbackId)} ${titleById.get(relation.targetFeedbackId) ?? relation.targetFeedbackId}`,
      }));
  }, [feedback, relationReferences.references]);
  const feedbackTargetId = feedback?.id ?? null;
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
    setFollowUpDraft(emptyFeedbackFollowUpDraft());
    setImagePreview(null);
    setInspectorOpen(false);
  }, [feedbackId]);

  useEffect(() => {
    if (editState && !entries.some((entry) => entry.message.id === editState.messageId)) {
      setEditState(null);
    }
  }, [editState, entries]);

  useEffect(() => {
    if (!lifecycleOptions.some((option) => option.value === followUpDraft.lifecycle)) {
      setFollowUpDraft((current) => ({ ...current, lifecycle: "unchanged" }));
    }
  }, [followUpDraft.lifecycle, lifecycleOptions]);

  useEffect(() => {
    if (!linkedCommentMessageId) return;

    const frameId = window.requestAnimationFrame(() => {
      const element = commentElementRefs.current.get(linkedCommentMessageId);
      element?.scrollIntoView({ behavior: "smooth", block: "center" });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [linkedCommentMessageId]);

  useEffect(() => {
    if (!feedbackTargetId) {
      setMentionableUsers([]);
      return;
    }

    let cancelled = false;
    loadMentionableUsersRef.current({ targetId: feedbackTargetId, targetType: "feedback" })
      .then((users) => {
        if (!cancelled) setMentionableUsers(users.filter((user) => user.status === "active"));
      })
      .catch(() => {
        if (!cancelled) setMentionableUsers([]);
      });

    return () => {
      cancelled = true;
    };
  }, [feedbackTargetId]);

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

  const selectedAssigneeUserId = followUpDraft.assignee === "unassigned" ? null : followUpDraft.assignee;
  const hasAssigneeChange = canChangeAssignee &&
    followUpDraft.assignee !== "unchanged" &&
    selectedAssigneeUserId !== (feedback.assigneeUserId ?? null);
  const allowEmptyFollowUp = hasAssigneeChange || ["start", "accept_verification"].includes(followUpDraft.lifecycle);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (followUpSubmitting) return;
    const body = host.commentDraft.serialize(draft).trim();
    const transitionResult = feedbackFollowUpTransition({
      body,
      currentUser,
      draft: followUpDraft,
      feedback,
    });
    if (transitionResult.error) {
      notify(transitionResult.error);
      return;
    }
    if (!body && !transitionResult.transition && !hasAssigneeChange) {
      notify("请填写跟进内容，或选择要更新的状态和处理人");
      return;
    }

    setFollowUpSubmitting(true);
    try {
      await submitFeedbackFollowUp(feedback.id, {
        expectedVersion: feedback.version,
        ...(body ? {
          comment: {
            body,
            ...(draftMode.type === "reply" ? {
              parentMessageId: draftMode.rootMessageId,
              ...(draftMode.targetMessageId !== draftMode.rootMessageId ? { replyToMessageId: draftMode.targetMessageId } : {}),
            } : {}),
          },
        } : {}),
        ...(hasAssigneeChange ? { assigneeUserId: selectedAssigneeUserId } : {}),
        ...(transitionResult.transition ? { transition: transitionResult.transition } : {}),
      });
      await refreshFeedbackIssueData();
      setDraft(host.commentDraft.empty());
      setDraftMode({ type: "default" });
      setFollowUpDraft(emptyFeedbackFollowUpDraft());
      notify("跟进已发布");
    } catch (error) {
      notify(feedbackMutationFailureMessage(error, "跟进发布失败"));
    } finally {
      setFollowUpSubmitting(false);
    }
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
          <FeedbackButton
            aria-controls="feedback-issue-inspector"
            aria-expanded={inspectorOpen}
            className="feedback-issue-inspector-trigger"
            onClick={() => setInspectorOpen(true)}
            variant="secondary"
          >
            <SlidersHorizontal aria-hidden="true" />
            属性
          </FeedbackButton>
        </div>
      </header>

      <main className="feedback-issue-detail-layout">
        <section className="feedback-issue-thread" aria-label="反馈讨论">
          <PendingVerificationBanner feedback={feedback} />
          <OriginalFeedbackCard
            canEdit={canEditMetadata}
            feedback={feedback}
            mentionUsersById={mentionUsersById}
            onOpenImage={setImagePreview}
            onSave={(description) => runFeedbackMutation(
              () => updateFeedbackReport(feedback.id, { description, expectedVersion: feedback.version }),
              "原始报告已更新",
              "原始报告更新失败",
            )}
            users={users}
          />

          <div className="feedback-issue-timeline">
            {timelineEntries.map((item) => {
              if (item.kind === "activity") {
                return <FeedbackActivityEvent entries={item.activities} key={item.activities[0]?.id} users={users} />;
              }
              const { message, thread } = item.comment;
              return (
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
                    {item.activities.length > 0 && (
                      <div className="feedback-issue-comment-changes" aria-label="本次跟进变更">
                        {item.activities.map((activity) => (
                          <span key={activity.id}>{feedbackActivityLabel(activity, usersById)}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>

          <div className="feedback-issue-composer">
            <CommentComposer
              allowEmptySubmit={allowEmptyFollowUp}
              currentMember={currentUser?.name ?? "User"}
              currentUserAvatarUrl={currentUser?.avatarUrl}
              currentUserId={currentUser?.id ?? ""}
              draft={draft}
              footerActions={(
                <FeedbackFollowUpControls
                  adminReason={followUpDraft.adminReason}
                  administrativeTakeoverRequired={Boolean(currentUser?.role === "admin" && currentUser.id !== feedback.createdBy)}
                  assigneeOptions={assigneeOptions}
                  assigneeValue={followUpDraft.assignee}
                  canChangeAssignee={canChangeAssignee}
                  duplicateTargetFeedbackId={followUpDraft.duplicateTargetFeedbackId}
                  duplicateTargets={duplicateTargets}
                  lifecycleChoice={followUpDraft.lifecycle}
                  lifecycleOptions={lifecycleOptions}
                  onAdminReasonChange={(adminReason) => setFollowUpDraft((current) => ({ ...current, adminReason }))}
                  onAssigneeChange={(assignee) => setFollowUpDraft((current) => ({ ...current, assignee }))}
                  onDuplicateTargetChange={(duplicateTargetFeedbackId) => setFollowUpDraft((current) => ({ ...current, duplicateTargetFeedbackId }))}
                  onLifecycleChange={(lifecycle) => setFollowUpDraft((current) => ({ ...current, lifecycle }))}
                  onResolutionChange={(resolution) => setFollowUpDraft((current) => ({ ...current, resolution }))}
                  resolution={followUpDraft.resolution}
                />
              )}
              mentionableUsers={mentionableUsers}
              mode={draftMode}
              onCancelMode={() => {
                setDraft(host.commentDraft.empty());
                setDraftMode({ type: "default" });
              }}
              onDraftChange={setDraft}
              onSubmit={handleSubmit}
              onUploadAttachment={uploadFeedbackCommentAttachment}
              submitLabel={followUpSubmitting ? "正在发布" : "发布跟进"}
            />
          </div>
        </section>

        <FeedbackIssueInspector
          feedback={feedback}
          open={inspectorOpen}
          onClose={() => setInspectorOpen(false)}
        >
          <details className="feedback-issue-related-resources">
            <summary>相关资源</summary>
            <RelatedResourcesPanel canEdit={Boolean(currentUser)} contextId={feedback.id} contextType="feedback" notify={notify} />
          </details>
          <FeedbackSubscriptionControls
            disabled={subscriptionLoading}
            mode={subscriptionMode}
            onChange={changeSubscription}
          />
          <IssueSidebar
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
            onSaveMetadata={(input) => runFeedbackMutation(
              () => updateFeedbackMetadata(feedback.id, { ...input, expectedVersion: feedback.version }),
              "反馈属性已更新",
              "反馈属性更新失败",
            )}
            projects={projects}
            users={users}
          />
        </FeedbackIssueInspector>
      </main>

      {imagePreview && <ImagePreviewDialog preview={imagePreview} onClose={() => setImagePreview(null)} />}
    </div>
  );
}

function PendingVerificationBanner({ feedback }: { feedback: FeedbackWebIssue }) {
  if (feedback.stage !== "pending_verification") return null;
  const activity = [...feedback.activity]
    .reverse()
    .find((item) => item.activityType === "feedback.lifecycle.changed" && item.payload.nextStage === "pending_verification");
  const command = activity?.payload.command;
  const note = command && typeof command === "object" && "note" in command && typeof command.note === "string"
    ? command.note
    : "等待反馈发起人确认处理结果。";
  const resolution = typeof activity?.payload.nextResolution === "string"
    ? activity.payload.nextResolution as keyof typeof feedbackResolutionLabel
    : null;

  return (
    <aside className="feedback-verification-banner">
      <span><CheckCircle2 aria-hidden="true" /></span>
      <div>
        <strong>等待验证{resolution ? ` · ${feedbackResolutionLabel[resolution]}` : ""}</strong>
        <p>{note}</p>
      </div>
      <small>可在下方跟进区确认关闭或退回处理</small>
    </aside>
  );
}

function FeedbackIssueInspector({
  children,
  feedback,
  onClose,
  open,
}: {
  children: ReactNode;
  feedback: FeedbackWebIssue;
  onClose: () => void;
  open: boolean;
}) {
  const mobileViewport = useFeedbackInspectorMobileViewport();

  useEffect(() => {
    if (!mobileViewport || !open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [mobileViewport, onClose, open]);

  const inspector = (
    <aside
      aria-label="反馈属性"
      className={mobileViewport ? "feedback-issue-inspector-dialog" : "feedback-issue-sidebar"}
      id="feedback-issue-inspector"
    >
      <header className="feedback-issue-inspector-heading">
        <span>
          <small>反馈检查器</small>
          <strong>属性与处理</strong>
        </span>
        <span className="feedback-issue-inspector-identity">
          <IssueStateBadge feedback={feedback} />
          <span>#{feedbackIssueDisplayId(feedback.id)}</span>
        </span>
        {mobileViewport ? (
          <button aria-label="关闭反馈属性" onClick={onClose} type="button">
            <X aria-hidden="true" />
          </button>
        ) : null}
      </header>
      <div className="feedback-issue-inspector-body">{children}</div>
    </aside>
  );

  if (!mobileViewport) return inspector;
  if (!open) return null;
  return createPortal(
    <div className="feedback-issue-inspector-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      {inspector}
    </div>,
    document.body,
  );
}

function useFeedbackInspectorMobileViewport() {
  const query = "(max-width: 720px)";
  const [mobile, setMobile] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);

  useEffect(() => {
    const media = window.matchMedia(query);
    const sync = () => setMobile(media.matches);
    media.addEventListener("change", sync);
    sync();
    return () => media.removeEventListener("change", sync);
  }, []);

  return mobile;
}

function OriginalFeedbackCard({
  canEdit,
  feedback,
  mentionUsersById,
  onOpenImage,
  onSave,
  users,
}: {
  canEdit: boolean;
  feedback: FeedbackWebIssue;
  mentionUsersById: Map<string, FeedbackCommentMentionUser>;
  onOpenImage: (preview: FeedbackImagePreview) => void;
  onSave: (description: string) => Promise<boolean>;
  users: readonly FeedbackWebUser[];
}) {
  const { CommentBodyText, UserAvatar } = useFeedbackWebHost().components;
  const author = feedbackIssueAuthor(feedback, users);
  const createdAt = commentTimeDisplay(feedback.createdAt);
  const [editing, setEditing] = useState(false);
  const [description, setDescription] = useState(feedback.description);

  useEffect(() => {
    setDescription(feedback.description);
    setEditing(false);
  }, [feedback.description, feedback.id]);

  const save = async () => {
    const nextDescription = description.trim();
    if (!nextDescription || nextDescription === feedback.description) return;
    if (await onSave(nextDescription)) setEditing(false);
  };

  return (
    <article className="feedback-issue-original-card">
      <UserAvatar avatarUrl={author.avatarUrl} className="h-8 w-8 text-[11px] shadow-sm" frame={false} name={author.name} />
      <div className="feedback-issue-original-main">
        <div className="feedback-issue-comment-header">
          <strong>{author.name}</strong>
          <time dateTime={feedback.createdAt} title={createdAt.title}>{createdAt.label}</time>
          {canEdit && !editing && (
            <FeedbackButton size="sm" type="button" variant="ghost" onClick={() => setEditing(true)}>
              <Pencil aria-hidden="true" />
              编辑原始报告
            </FeedbackButton>
          )}
        </div>
        <div className="feedback-issue-comment-body">
          {editing ? (
            <div className="feedback-report-editor">
              <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={8} />
              <small>原有附件保持不变；正文支持 Markdown。</small>
              <div>
                <FeedbackButton disabled={!description.trim() || description.trim() === feedback.description} size="sm" type="button" onClick={save}>
                  <Save aria-hidden="true" />
                  保存报告
                </FeedbackButton>
                <FeedbackButton size="sm" type="button" variant="ghost" onClick={() => {
                  setDescription(feedback.description);
                  setEditing(false);
                }}>
                  取消
                </FeedbackButton>
              </div>
            </div>
          ) : (
            <CommentBodyText
              attachments={feedback.reportAttachments}
              body={feedback.description}
              mentionUsersById={mentionUsersById}
              onOpenImage={onOpenImage}
            />
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
  onAddRelation,
  onRemoveRelation,
  onSaveMetadata,
  projects,
  users,
}: {
  canEdit: boolean;
  comments: readonly FeedbackWebCommentThread[];
  feedback: FeedbackWebIssue;
  onAddRelation: (input: { targetFeedbackId: string; type: FeedbackRelationType }) => Promise<boolean>;
  onRemoveRelation: (relationId: string) => Promise<boolean>;
  onSaveMetadata: (input: {
    causeCategories?: string[];
    impact?: FeedbackImpact;
    priority?: FeedbackPriority | null;
    projectId?: string | null;
    title?: string;
  }) => Promise<boolean>;
  projects: readonly FeedbackWebProject[];
  users: readonly FeedbackWebUser[];
}) {
  const { UserAvatar } = useFeedbackWebHost().components;
  const [metadataDraft, setMetadataDraft] = useState(() => feedbackMetadataDraftFromFeedback(feedback));
  const [metadataSaving, setMetadataSaving] = useState(false);
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
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const project = feedback.projectId ? projectById.get(feedback.projectId) ?? null : null;
  const causeOptions = useMemo(
    () => Array.from(new Set([...teamFeedbackCauseOptions(), ...feedback.causeCategories])).filter(Boolean),
    [feedback.causeCategories],
  );
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
    setRelationDraft((current) => {
      const targetFeedbackId = relationTargets.some((item) => item.id === current.targetFeedbackId)
        ? current.targetFeedbackId
        : "";
      return targetFeedbackId === current.targetFeedbackId
        ? current
        : { ...current, targetFeedbackId };
    });
  }, [feedback.id, relationTargets]);

  const commitMetadata = async (input: Parameters<typeof onSaveMetadata>[0]) => {
    if (metadataSaving) return false;
    setMetadataSaving(true);
    try {
      return await onSaveMetadata(input);
    } finally {
      setMetadataSaving(false);
    }
  };

  const toggleCause = async (cause: string) => {
    if (metadataSaving) return;
    const previous = metadataDraft;
    const next = (() => {
      const current = metadataDraft;
      const exists = current.causeCategories.includes(cause);
      const nextCategories = exists
        ? current.causeCategories.filter((item) => item !== cause)
        : [...current.causeCategories, cause];
      return nextCategories.length > 0 ? { ...current, causeCategories: nextCategories } : current;
    })();
    if (next === previous) return;
    setMetadataDraft(next);
    if (!(await commitMetadata({ causeCategories: next.causeCategories }))) setMetadataDraft(previous);
  };

  const saveTitle = async () => {
    if (metadataSaving) return;
    const title = metadataDraft.title.trim();
    if (!title || title === feedback.title) {
      if (!title) setMetadataDraft((current) => ({ ...current, title: feedback.title }));
      return;
    }
    if (!(await commitMetadata({ title }))) {
      setMetadataDraft((current) => ({ ...current, title: feedback.title }));
    }
  };

  const saveSelect = async <K extends "impact" | "priority" | "projectId">(
    field: K,
    value: FeedbackMetadataDraft[K],
    persistedValue: FeedbackImpact | FeedbackPriority | string | null,
  ) => {
    if (metadataSaving) return;
    const previous = metadataDraft[field];
    setMetadataDraft((current) => ({ ...current, [field]: value }));
    const ok = await commitMetadata({ [field]: persistedValue });
    if (!ok) setMetadataDraft((current) => ({ ...current, [field]: previous }));
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
            disabled={metadataSaving}
            value={metadataDraft.title}
            onChange={(event) => setMetadataDraft((current) => ({ ...current, title: event.target.value }))}
            onBlur={saveTitle}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
              if (event.key === "Escape") {
                setMetadataDraft((current) => ({ ...current, title: feedback.title }));
                event.currentTarget.blur();
              }
            }}
          />
        ) : (
          <strong>{feedback.title}</strong>
        )}
      </div>
      <div className="feedback-issue-sidebar-block">
        <span>处理人</span>
        <div className="feedback-issue-sidebar-person">
          <UserAvatar avatarUrl={assignee.avatarUrl} className="h-7 w-7 text-[10px]" frame={false} name={assignee.name} />
          <strong>{assignee.name}</strong>
        </div>
        <small className="feedback-issue-sidebar-empty">在下方跟进区改派</small>
      </div>
      <div className="feedback-issue-sidebar-block">
        <span>分类</span>
        {canEdit ? (
          <div className="feedback-issue-sidebar-choice-list">
            {causeOptions.map((cause) => (
              <label key={cause}>
                <input checked={metadataDraft.causeCategories.includes(cause)} disabled={metadataSaving} type="checkbox" onChange={() => void toggleCause(cause)} />
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
          <select className="feedback-issue-sidebar-input" disabled={metadataSaving} value={metadataDraft.impact} onChange={(event) => {
            const value = event.target.value as FeedbackImpact;
            void saveSelect("impact", value, value);
          }}>
            {feedbackImpactOptions.map((item) => <option key={item} value={item}>{feedbackImpactLabel[item]}</option>)}
          </select>
        ) : (
          <strong>{feedbackImpactLabel[feedback.impact]}</strong>
        )}
      </div>
      <div className="feedback-issue-sidebar-block">
        <span>优先级</span>
        {canEdit ? (
          <select className="feedback-issue-sidebar-input" disabled={metadataSaving} value={metadataDraft.priority} onChange={(event) => {
            const value = event.target.value as "" | FeedbackPriority;
            void saveSelect("priority", value, value || null);
          }}>
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
          <select className="feedback-issue-sidebar-input" disabled={metadataSaving} value={metadataDraft.projectId} onChange={(event) => {
            const value = event.target.value;
            void saveSelect("projectId", value, value || null);
          }}>
            <option value="">不归属项目</option>
            {projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        ) : project ? (
          <strong>{project.name}</strong>
        ) : (
          <p className="feedback-issue-sidebar-empty">未加入项目</p>
        )}
      </div>
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

function FeedbackActivityEvent({ entries, users }: { entries: readonly FeedbackWebActivityItem[]; users: readonly FeedbackWebUser[] }) {
  const entry = entries[0];
  if (!entry) return null;
  const userById = new Map(users.map((user) => [user.id, user]));
  const activityText = entries.map((item) => feedbackActivityLabel(item, userById)).join("，并");

  return (
    <div className="feedback-issue-event-row">
      <span aria-hidden="true" className="feedback-issue-event-dot" />
      <p>
        <strong>{entry.actorUserId ? userById.get(entry.actorUserId)?.name ?? "未知成员" : "系统"}</strong> {activityText}
        <time dateTime={entry.at}>{formatIssueDate(entry.at)}</time>
      </p>
    </div>
  );
}

function feedbackActivityLabel(entry: FeedbackWebActivityItem, userById: ReadonlyMap<string, FeedbackWebUser>) {
  if (entry.activityType === "feedback.created") return "创建了反馈";
  if (entry.activityType === "feedback.report.changed") return "更新了原始报告";
  if (entry.activityType === "feedback.metadata.changed") return "更新了反馈属性";
  if (entry.activityType === "feedback.assignee.changed") {
    const nextAssigneeUserId = typeof entry.payload.nextAssigneeUserId === "string" ? entry.payload.nextAssigneeUserId : null;
    return `将处理人调整为 ${nextAssigneeUserId ? userById.get(nextAssigneeUserId)?.name ?? "未知成员" : "未指派"}`;
  }
  if (entry.activityType === "feedback.lifecycle.changed") {
    const nextStage = typeof entry.payload.nextStage === "string" && entry.payload.nextStage in feedbackStageLabel
      ? entry.payload.nextStage as keyof typeof feedbackStageLabel
      : null;
    return nextStage ? `将状态更新为 ${feedbackStageLabel[nextStage]}` : "更新了生命周期";
  }
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
