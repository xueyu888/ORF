import { Check, X } from "lucide-react";
import { clsx } from "clsx";
import type { ReactNode } from "react";
import { useState } from "react";
import { useDraggableFloating } from "../hooks/useDraggableFloating";
import { uncertaintyLevelOptions, uncertaintyScores } from "../domain/orfSettlement";
import { BountyButton, BountyDialog } from "../features/bounty-hall/BountyHallSkin";
import { teamFeedbackCauseOptions } from "../features/feedback/model/feedbackCategories";
import { useOrf } from "../state/OrfProvider";
import type { Impact, UncertaintyLevel } from "../types/orf";
import { impactLabel } from "../utils/labels";
import { Button, Field } from "./ui";

const INTERNAL_FEEDBACK_SOURCE = "Team review" as const;
const feedbackImpactOptions: Impact[] = ["Low", "Medium", "High", "Critical"];

function ModalFrame({ title, children, size = "md" }: { title: string; children: ReactNode; size?: "md" | "lg" }) {
  const { closeModal } = useOrf();
  const drag = useDraggableFloating<HTMLDivElement>({ resetKey: title });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6" onMouseDown={closeModal}>
      <div
        ref={drag.ref}
        style={drag.style}
        aria-label={title}
        aria-modal="true"
        className={clsx(
          "orf-card orf-draggable-floating flex max-h-[88vh] w-full flex-col overflow-hidden rounded-lg",
          size === "lg" ? "max-w-2xl" : "max-w-xl",
        )}
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="orf-drag-handle flex items-center justify-between border-b orf-border px-6 py-4" {...drag.handleProps}>
          <div className="orf-text-primary text-base font-semibold">{title}</div>
          <button aria-label="关闭" onClick={closeModal} className="orf-control orf-ghost-action inline-flex h-8 w-8 items-center justify-center">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto p-6">{children}</div>
      </div>
    </div>
  );
}

export function GlobalModals() {
  const { modal } = useOrf();

  if (modal.type === "newResult") return <NewResultModal objectiveId={modal.objectiveId} source={modal.source} />;
  if (modal.type === "newFeedback") return <NewFeedbackModal />;
  if (modal.type === "recruitChallengers") return <RecruitChallengersModal key={modal.objectiveId} objectiveId={modal.objectiveId} />;
  return null;
}

function RecruitChallengersModal({ objectiveId }: { objectiveId?: string }) {
  const { state, closeModal, recruitObjectiveChallengers } = useOrf();
  const objective = state.objectives.find((item) => item.id === objectiveId);
  const candidates = objective
    ? state.users.filter(
        (user) =>
          user.status === "active" &&
          user.role === "member" &&
          !objective.challengerUserIds.includes(user.id) &&
          !objective.assignedChallengerUserIds.includes(user.id),
      )
    : [];
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  if (!objective) return null;

  const toggleMember = (member: string) => {
    setSelectedMembers((items) =>
      items.includes(member) ? items.filter((item) => item !== member) : [...items, member],
    );
  };

  return (
    <ModalFrame title="征召挑战者">
      <form
        className="grid gap-4"
        onSubmit={async (event) => {
          event.preventDefault();
          if (selectedMembers.length === 0 || submitting) return;
          setSubmitting(true);
          try {
            const ok = await recruitObjectiveChallengers(objective.id, selectedMembers);
            if (ok) closeModal();
          } finally {
            setSubmitting(false);
          }
        }}
      >
        <div className="orf-surface-muted rounded-lg border orf-border p-3 text-sm">
          <div className="font-medium orf-text-primary">{objective.title}</div>
          <div className="mt-1 orf-text-secondary">已接受：{objective.challengers.length > 0 ? objective.challengers.join("、") : "暂无"}</div>
          <div className="mt-1 orf-text-secondary">待响应：{objective.assignedChallengers.length > 0 ? objective.assignedChallengers.join("、") : "暂无"}</div>
        </div>
        <div className="grid gap-2">
          {candidates.map((user) => (
            <label key={user.id} className="flex items-center justify-between rounded-lg border orf-border px-3 py-2 text-sm">
              <span>
                <span className="font-medium orf-text-primary">{user.name}</span>
                <span className="ml-2 orf-text-muted">{user.email}</span>
              </span>
              <input aria-label={`征召 ${user.name}`} checked={selectedMembers.includes(user.name)} onChange={() => toggleMember(user.name)} type="checkbox" />
            </label>
          ))}
          {candidates.length === 0 && <div className="rounded-lg border orf-border px-3 py-6 text-center text-sm orf-text-secondary">没有可征召的成员。</div>}
        </div>
        <div className="flex justify-end gap-2"><Button variant="secondary" type="button" onClick={closeModal}>取消</Button><Button disabled={selectedMembers.length === 0 || submitting} type="submit">发送征召</Button></div>
      </form>
    </ModalFrame>
  );
}

function hasBlankRequiredValues(values: string[]) {
  return values.some((value) => value.trim().length === 0);
}

function NewResultModal({ objectiveId, source = "managerDefined" }: { objectiveId?: string; source?: "managerDefined" | "memberProposed" }) {
  const { state, createResult, closeModal, notify } = useOrf();
  const [selectedObjectiveId, setSelectedObjectiveId] = useState(objectiveId ?? state.objectives[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [metricName, setMetricName] = useState("");
  const [uncertaintyLevel, setUncertaintyLevel] = useState<UncertaintyLevel | "">("");
  const [submitting, setSubmitting] = useState(false);

  return (
    <ModalFrame title={source === "memberProposed" ? "提出指标" : "新增指标"}>
      <form
        className="grid gap-4"
        onSubmit={async (event) => {
          event.preventDefault();
          if (hasBlankRequiredValues([selectedObjectiveId, title, metricName, uncertaintyLevel])) {
            notify("请填写所有必填字段");
            return;
          }
          if (submitting) return;
          setSubmitting(true);
          try {
            const selectedUncertaintyLevel = uncertaintyLevel as UncertaintyLevel;
            const ok = await createResult({ objectiveId: selectedObjectiveId, title: title.trim(), metricName: metricName.trim(), uncertaintyLevel: selectedUncertaintyLevel, source });
            if (ok) closeModal();
          } finally {
            setSubmitting(false);
          }
        }}
      >
        <Field label="所属目标"><select className="orf-input px-3 py-2" required value={selectedObjectiveId} onChange={(event) => setSelectedObjectiveId(event.target.value)}>{state.objectives.map((objective) => <option key={objective.id} value={objective.id}>{objective.title}</option>)}</select></Field>
        <Field label="指标标题"><input className="orf-input px-3 py-2" required value={title} onChange={(event) => setTitle(event.target.value)} /></Field>
        <Field label="衡量指标"><input className="orf-input px-3 py-2" required value={metricName} onChange={(event) => setMetricName(event.target.value)} /></Field>
        <Field label="积分等级">
          <select className="orf-input px-3 py-2" required value={uncertaintyLevel} onChange={(event) => setUncertaintyLevel(event.target.value as UncertaintyLevel | "")}>
            <option value="">请选择积分等级</option>
            {uncertaintyLevelOptions.map((level) => <option key={level} value={level}>{level} · {uncertaintyScores[level]} 分</option>)}
          </select>
        </Field>
        <div className="flex justify-end gap-2"><Button variant="secondary" type="button" onClick={closeModal}>取消</Button><Button type="submit" disabled={submitting}>{source === "memberProposed" ? "提交指标" : "保存指标"}</Button></div>
      </form>
    </ModalFrame>
  );
}

function NewFeedbackModal() {
  const { state, createFeedback, closeModal, currentUser, notify } = useOrf();
  const defaultOwner = currentUser?.name ?? state.users.find((user) => user.id === state.currentUserId)?.name ?? state.users[0]?.name ?? "User";
  const [phenomenon, setPhenomenon] = useState("");
  const causeOptions = teamFeedbackCauseOptions(state.causeCategories);
  const [cause, setCause] = useState(causeOptions[0] ?? "技术问题");
  const [impact, setImpact] = useState<Impact>("Medium");
  const activeOwnerOptions = state.users.filter((user) => user.status === "active").map((user) => user.name);
  const ownerOptions = activeOwnerOptions.length > 0 ? activeOwnerOptions : [defaultOwner];
  const initialOwner = ownerOptions.includes(defaultOwner) ? defaultOwner : ownerOptions[0] ?? defaultOwner;
  const [owner, setOwner] = useState(initialOwner);
  const [suggestedAdjustment, setSuggestedAdjustment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  return (
    <BountyDialog
      className="feedback-create-dialog"
      footer={(
        <>
          <BountyButton disabled={submitting} onClick={closeModal} variant="secondary">取消</BountyButton>
          <BountyButton disabled={submitting} form="new-feedback-form" loading={submitting} type="submit">
            <Check aria-hidden="true" />
            保存反馈
          </BountyButton>
        </>
      )}
      onClose={closeModal}
      subtitle="团队内部 issue 会进入统一反馈池。"
      title="新建反馈"
    >
      <form
        className="feedback-create-form"
        id="new-feedback-form"
        onSubmit={async (event) => {
          event.preventDefault();
          if (hasBlankRequiredValues([phenomenon, cause, suggestedAdjustment, owner])) {
            notify("请填写所有必填字段");
            return;
          }
          if (submitting) return;

          setSubmitting(true);
          try {
            const ok = await createFeedback({
              phenomenon: phenomenon.trim(),
              causeCategories: [cause],
              impact,
              suggestedAdjustment: suggestedAdjustment.trim(),
              source: INTERNAL_FEEDBACK_SOURCE,
              owner: owner.trim(),
            });
            if (ok) closeModal();
          } finally {
            setSubmitting(false);
          }
        }}
      >
        <label className="feedback-form-field feedback-form-field-wide">
          <span>标题</span>
          <input required value={phenomenon} onChange={(event) => setPhenomenon(event.target.value)} />
        </label>
        <label className="feedback-form-field feedback-form-field-wide">
          <span>说明</span>
          <textarea required value={suggestedAdjustment} onChange={(event) => setSuggestedAdjustment(event.target.value)} />
        </label>
        <label className="feedback-form-field">
          <span>分类</span>
          <select required value={cause} onChange={(event) => setCause(event.target.value)}>
            {causeOptions.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <label className="feedback-form-field">
          <span>影响</span>
          <select value={impact} onChange={(event) => setImpact(event.target.value as Impact)}>
            {feedbackImpactOptions.map((item) => <option key={item} value={item}>{impactLabel[item]}</option>)}
          </select>
        </label>
        <label className="feedback-form-field feedback-form-field-wide">
          <span>处理人</span>
          <select required value={owner} onChange={(event) => setOwner(event.target.value)}>
            {ownerOptions.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
      </form>
    </BountyDialog>
  );
}
