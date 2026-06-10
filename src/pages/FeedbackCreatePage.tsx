import { ArrowLeft, Check, ImagePlus } from "lucide-react";
import type { FormEvent } from "react";
import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
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
import { useOrf } from "../state/OrfProvider";
import type { Impact } from "../types/orf";
import { impactLabel } from "../utils/labels";

const feedbackImpactOptions: Impact[] = ["Low", "Medium", "High", "Critical"];

type PendingFeedbackAttachment = {
  file: File;
  id: string;
};

export function FeedbackCreatePage() {
  const navigate = useNavigate();
  const { createFeedback, currentUser, notify, state } = useOrf();
  const canCreateFeedback = canCreateFeedbackFromVisibleState(state, currentUser);
  const defaultOwner = currentUser?.name ?? state.users.find((user) => user.id === state.currentUserId)?.name ?? state.users[0]?.name ?? "User";
  const causeOptions = teamFeedbackCauseOptions(state.causeCategories);
  const activeOwnerOptions = state.users.filter((user) => user.status === "active").map((user) => user.name);
  const ownerOptions = activeOwnerOptions.length > 0 ? activeOwnerOptions : [defaultOwner];
  const initialOwner = ownerOptions.includes(defaultOwner) ? defaultOwner : ownerOptions[0] ?? defaultOwner;
  const [title, setTitle] = useState("");
  const [draft, setDraft] = useState<CommentDraft>(() => emptyCommentDraft());
  const [cause, setCause] = useState(causeOptions[0] ?? "技术问题");
  const [impact, setImpact] = useState<Impact>("Medium");
  const [owner, setOwner] = useState(initialOwner);
  const [pendingAttachments, setPendingAttachments] = useState<PendingFeedbackAttachment[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const attachmentCounterRef = useRef(0);

  const body = serializeCommentDraft(draft).trim();
  const referencedAttachments = pendingAttachments.filter((attachment) => body.includes(`orf-pending-attachment:${attachment.id}`));

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
    setPendingAttachments((items) => [...items, { file, id }]);
    return `![${file.name || "image"}](orf-pending-attachment:${id})`;
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    if (!title.trim() || !body || !cause.trim() || !owner.trim()) {
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
        owner: owner.trim(),
        attachments: referencedAttachments,
      });
      if (feedback) {
        navigate(`/feedback/${encodeURIComponent(feedback.id)}`);
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
          <h1>新建反馈</h1>
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
                      <span key={attachment.id}>
                        <ImagePlus aria-hidden="true" />
                        {attachment.file.name || "image"}
                      </span>
                    ))}
                  </div>
                )}
            </div>
          </article>

        </section>

        <aside className="feedback-create-sidebar" aria-label="反馈属性">
          <label className="feedback-create-sidebar-field">
            <span>处理人</span>
            <select required value={owner} onChange={(event) => setOwner(event.target.value)}>
              {ownerOptions.map((name) => <option key={name} value={name}>{name}</option>)}
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
          <button className="feedback-create-submit" disabled={submitting} type="submit">
            <Check aria-hidden="true" />
            {submitting ? "创建中..." : "创建 issue"}
          </button>
        </div>
      </form>
    </div>
  );
}
