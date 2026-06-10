import { X } from "lucide-react";
import { clsx } from "clsx";
import type { ReactNode } from "react";
import { useState } from "react";
import { useDraggableFloating } from "../hooks/useDraggableFloating";
import {
  isObjectiveAssignedChallenger,
  isObjectiveChallenger,
} from "../domain/orfObjectiveParticipants";
import { uncertaintyLevelOptions, uncertaintyScores } from "../domain/orfSettlement";
import { useOrf } from "../state/OrfProvider";
import type { UncertaintyLevel } from "../types/orf";
import { Button, Field } from "./ui";

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
          !isObjectiveChallenger(objective, user.id) &&
          !isObjectiveAssignedChallenger(objective, user.id),
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
  const [uncertaintyLevel, setUncertaintyLevel] = useState<UncertaintyLevel | "">("");
  const [submitting, setSubmitting] = useState(false);

  return (
    <ModalFrame title={source === "memberProposed" ? "提出指标" : "新增指标"}>
      <form
        className="grid gap-4"
        onSubmit={async (event) => {
          event.preventDefault();
          if (hasBlankRequiredValues([selectedObjectiveId, title, uncertaintyLevel])) {
            notify("请填写所有必填字段");
            return;
          }
          if (submitting) return;
          setSubmitting(true);
          try {
            const selectedUncertaintyLevel = uncertaintyLevel as UncertaintyLevel;
            const ok = await createResult({ objectiveId: selectedObjectiveId, title: title.trim(), uncertaintyLevel: selectedUncertaintyLevel, source });
            if (ok) closeModal();
          } finally {
            setSubmitting(false);
          }
        }}
      >
        <Field label="所属目标"><select className="orf-input px-3 py-2" required value={selectedObjectiveId} onChange={(event) => setSelectedObjectiveId(event.target.value)}>{state.objectives.map((objective) => <option key={objective.id} value={objective.id}>{objective.title}</option>)}</select></Field>
        <Field label="指标标题"><input className="orf-input px-3 py-2" required value={title} onChange={(event) => setTitle(event.target.value)} /></Field>
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
