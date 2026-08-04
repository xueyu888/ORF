import { ArrowLeft, Check, Paperclip } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ImagePreviewDialog } from "../components/ImagePreviewDialog";
import { Button } from "../components/ui";
import { UserAvatar } from "../components/UserAvatar";
import { BountyEmptyState } from "../features/bounty-hall/BountyHallSkin";
import {
  CommentDraftFields,
  emptyCommentDraft,
  serializeCommentDraft,
  type CommentDraft,
} from "../features/challenge/comments/CommentPanel";
import { canCreateFeedbackFromVisibleState } from "../features/feedback/model/feedbackCapabilities";
import { teamFeedbackCauseOptions } from "../features/feedback/model/feedbackCategories";
import { feedbackIssueHref } from "../features/feedback/model/feedbackIssue";
import { useFeedbackAssigneeOptions } from "../features/feedback/useFeedbackAssigneeOptions";
import { validOrfRichTextDraftAttachments } from "../features/rich-text/orfRichTextDraft";
import { useOrf } from "../state/OrfProvider";
import type { Impact } from "../types/orf";
import { impactLabel } from "../utils/labels";

const feedbackImpactOptions: Impact[] = ["Low", "Medium", "High", "Critical"];

type PendingFeedbackAttachment = {
  file: File;
  id: string;
  previewUrl: string;
};

export function FeedbackCreatePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { createFeedback, currentUser, notify, state } = useOrf();
  const canCreateFeedback = canCreateFeedbackFromVisibleState(state, currentUser);
  const causeOptions = teamFeedbackCauseOptions();
  const ownerOptions = useFeedbackAssigneeOptions(state.users, currentUser);
  const defaultOwnerUserId = currentUser?.id ?? state.currentUserId ?? ownerOptions[0]?.id ?? "";
  const initialOwnerUserId = ownerOptions.some((user) => user.id === defaultOwnerUserId) ? defaultOwnerUserId : ownerOptions[0]?.id ?? defaultOwnerUserId;
  const projectParam = searchParams.get("project") ?? "";
  const initialProjectId = state.projects.some((project) => project.id === projectParam) ? projectParam : "";
  const [title, setTitle] = useState("");
  const [draft, setDraft] = useState<CommentDraft>(() => emptyCommentDraft());
  const [cause, setCause] = useState<string>(causeOptions[0] ?? "技术问题");
  const [impact, setImpact] = useState<Impact>("Medium");
  const [ownerUserId, setOwnerUserId] = useState(initialOwnerUserId);
  const [projectId, setProjectId] = useState(initialProjectId);
  const [pendingAttachments, setPendingAttachments] = useState<PendingFeedbackAttachment[]>([]);
  const [previewAttachmentId, setPreviewAttachmentId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const attachmentCounterRef = useRef(0);
  const pendingPreviewUrlsRef = useRef(new Set<string>());

  const body = serializeCommentDraft(draft).trim();
  const referencedPendingAttachmentIds = new Set(
    validOrfRichTextDraftAttachments(draft).flatMap((attachment) => (
      attachment.kind === "pending" ? [attachment.pendingAttachmentId] : []
    )),
  );
  const referencedAttachments = pendingAttachments.filter((attachment) => referencedPendingAttachmentIds.has(attachment.id));
  const referencedImageAttachments = referencedAttachments.filter(isPendingFeedbackImageAttachment);
  const previewAttachmentIndex = previewAttachmentId
    ? referencedImageAttachments.findIndex((attachment) => attachment.id === previewAttachmentId)
    : -1;
  const previewAttachment = previewAttachmentIndex >= 0 ? referencedImageAttachments[previewAttachmentIndex] ?? null : null;

  useEffect(() => () => {
    for (const previewUrl of pendingPreviewUrlsRef.current) {
      URL.revokeObjectURL(previewUrl);
    }
    pendingPreviewUrlsRef.current.clear();
  }, []);

  useEffect(() => {
    if (projectId && !state.projects.some((project) => project.id === projectId)) {
      setProjectId("");
    }
  }, [projectId, state.projects]);

  useEffect(() => {
    if (ownerUserId && ownerOptions.some((user) => user.id === ownerUserId)) {
      return;
    }
    const nextOwnerUserId = ownerOptions.some((user) => user.id === defaultOwnerUserId)
      ? defaultOwnerUserId
      : ownerOptions[0]?.id ?? "";
    if (nextOwnerUserId && nextOwnerUserId !== ownerUserId) {
      setOwnerUserId(nextOwnerUserId);
    }
  }, [defaultOwnerUserId, ownerOptions, ownerUserId]);

  useEffect(() => {
    if (previewAttachmentId && !referencedImageAttachments.some((attachment) => attachment.id === previewAttachmentId)) {
      setPreviewAttachmentId(null);
    }
  }, [previewAttachmentId, referencedImageAttachments]);

  if (!canCreateFeedback) {
    return (
      <div className="bounty-hall-page feedback-issue-detail-page">
        <BountyEmptyState title="当前账号不能创建反馈" description="反馈创建需要 active 成员身份。" />
        <Link className="feedback-issue-back-link" to="/feedback">
          <ArrowLeft aria-hidden="true" />
          返回反馈列表
        </Link>
      </div>
    );
  }

  const uploadLocalAttachment = async (file: File) => {
    attachmentCounterRef.current += 1;
    const id = `pending-${Date.now()}-${attachmentCounterRef.current}`;
    const previewUrl = URL.createObjectURL(file);
    pendingPreviewUrlsRef.current.add(previewUrl);
    const markdown = `![${file.name || "attachment"}](orf-pending-attachment:${id})`;
    setPendingAttachments((items) => [...items, { file, id, previewUrl }]);
    return { markdown, previewUrl };
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    if (!title.trim() || !body || !cause.trim() || !ownerUserId.trim()) {
      notify("请填写标题、正文、分类和处理人");
      return;
    }

    setSubmitting(true);
    try {
      const feedback = await createFeedback({
        phenomenon: title.trim(),
        causeCategories: [cause.trim()],
        impact,
        initialBody: body,
        ownerUserId: ownerUserId.trim(),
        projectId: projectId || null,
        attachments: referencedAttachments,
      });
      if (feedback) {
        navigate(feedbackIssueHref(feedback.id));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bounty-hall-page feedback-issue-detail-page feedback-create-page">
      <header className="feedback-create-header">
        <div className="feedback-create-heading">
          <Link className="feedback-create-back-link" to="/feedback">
            <ArrowLeft aria-hidden="true" />
            反馈
          </Link>
        </div>
      </header>

      <form className="feedback-create-layout" id="new-feedback-issue-form" onSubmit={handleSubmit}>
        <section className="feedback-create-main" aria-label="新建反馈正文">
          <label className="feedback-create-title-field">
            <span className="sr-only">标题</span>
            <input
              autoFocus
              required
              placeholder="标题"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>

          <article className="feedback-create-editor-card">
            <div className="feedback-create-editor-header">
              <UserAvatar avatarUrl={currentUser?.avatarUrl} className="h-7 w-7 text-[11px]" frame={false} name={currentUser?.name ?? "User"} />
              <strong>{currentUser?.name ?? "User"}</strong>
            </div>
            <div className="feedback-create-body-field">
              <CommentDraftFields
                currentUserId={currentUser?.id ?? ""}
                draft={draft}
                idleHint=""
                mentionableUsers={[]}
                onDraftChange={setDraft}
                onUploadAttachment={uploadLocalAttachment}
                placeholder="描述反馈..."
                showSubmitButton={false}
                submitLabel="创建 issue"
                submitOnEnter={false}
              />
              {referencedAttachments.length > 0 && (
                <div className="feedback-create-attachment-strip">
                  {referencedAttachments.map((attachment) => (
                    isPendingFeedbackImageAttachment(attachment) ? (
                      <button
                        type="button"
                        className="feedback-create-image-preview"
                        key={attachment.id}
                        aria-label={`预览图片 ${attachment.file.name || "attachment"}`}
                        onClick={() => setPreviewAttachmentId(attachment.id)}
                      >
                        <img src={attachment.previewUrl} alt={attachment.file.name || "attachment"} />
                        <span>{attachment.file.name || "attachment"}</span>
                      </button>
                    ) : (
                      <span className="feedback-create-file-preview" key={attachment.id}>
                        <Paperclip aria-hidden="true" />
                        {attachment.file.name || "attachment"}
                      </span>
                    )
                  ))}
                </div>
              )}
            </div>
          </article>

        </section>

        <aside className="feedback-create-sidebar" aria-label="反馈属性">
          <label className="feedback-create-sidebar-field">
            <span>处理人</span>
            <select required value={ownerUserId} onChange={(event) => setOwnerUserId(event.target.value)}>
              {ownerOptions.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
            </select>
          </label>
          <label className="feedback-create-sidebar-field">
            <span>项目</span>
            <select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
              <option value="">不归属项目</option>
              {state.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
          </label>
          <label className="feedback-create-sidebar-field">
            <span>分类</span>
            <select required value={cause} onChange={(event) => setCause(event.target.value)}>
              {causeOptions.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label className="feedback-create-sidebar-field">
            <span>影响</span>
            <select value={impact} onChange={(event) => setImpact(event.target.value as Impact)}>
              {feedbackImpactOptions.map((item) => <option key={item} value={item}>{impactLabel[item]}</option>)}
            </select>
          </label>
        </aside>

        <div className="feedback-create-submit-row">
          <Button disabled={submitting} type="submit">
            <Check aria-hidden="true" />
            {submitting ? "创建中..." : "创建 issue"}
          </Button>
        </div>
      </form>
      {previewAttachment && (
        <ImagePreviewDialog
          preview={{
            alt: previewAttachment.file.name || "attachment",
            copySourceUrl: previewAttachment.previewUrl,
            downloadFileName: previewAttachment.file.name || "attachment",
            downloadUrl: previewAttachment.previewUrl,
            label: previewAttachment.file.name || "attachment",
            mimeType: previewAttachment.file.type || null,
            src: previewAttachment.previewUrl,
          }}
          navigation={referencedImageAttachments.length > 1 ? {
            canGoNext: previewAttachmentIndex < referencedImageAttachments.length - 1,
            canGoPrevious: previewAttachmentIndex > 0,
            counterLabel: `${previewAttachmentIndex + 1} / ${referencedImageAttachments.length}`,
            onGoNext: () => {
              const next = referencedImageAttachments[Math.min(previewAttachmentIndex + 1, referencedImageAttachments.length - 1)];
              if (next) setPreviewAttachmentId(next.id);
            },
            onGoPrevious: () => {
              const previous = referencedImageAttachments[Math.max(previewAttachmentIndex - 1, 0)];
              if (previous) setPreviewAttachmentId(previous.id);
            },
          } : undefined}
          onClose={() => setPreviewAttachmentId(null)}
        />
      )}
    </div>
  );
}

function isPendingFeedbackImageAttachment(attachment: PendingFeedbackAttachment) {
  return attachment.file.type.startsWith("image/");
}
