import { X } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { useDraggableFloating } from "../hooks/useDraggableFloating";
import { useOrf } from "../state/OrfProvider";
import type { FeedbackSource, Impact, Priority } from "../types/orf";
import { localDateString } from "../utils/date";
import { Button, Field } from "./ui";

function ModalFrame({ title, children }: { title: string; children: ReactNode }) {
  const { closeModal } = useOrf();
  const drag = useDraggableFloating<HTMLDivElement>({ resetKey: title });

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 px-4 pt-[9vh]" onMouseDown={closeModal}>
      <div ref={drag.ref} style={drag.style} className="orf-card orf-draggable-floating w-full max-w-xl rounded-xl" onMouseDown={(event) => event.stopPropagation()}>
        <div className="orf-drag-handle flex items-center justify-between border-b orf-border px-5 py-4" {...drag.handleProps}>
          <div className="orf-text-primary text-sm font-semibold">{title}</div>
          <button onClick={closeModal} className="orf-text-muted orf-hover-text">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function GlobalModals() {
  const { modal } = useOrf();

  if (modal.type === "newObjective") return <NewObjectiveModal />;
  if (modal.type === "newResult") return <NewResultModal objectiveId={modal.objectiveId} source={modal.source} />;
  if (modal.type === "newFeedback") return <NewFeedbackModal objectiveId={modal.objectiveId} resultId={modal.resultId} />;
  if (modal.type === "newTask") return <NewTaskModal objectiveId={modal.objectiveId} resultId={modal.resultId} feedbackId={modal.feedbackId} />;
  if (modal.type === "resultUpdate") return <ResultUpdateModal resultId={modal.resultId} feedbackId={modal.feedbackId} />;
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
          !objective.challengers.includes(user.name) &&
          !objective.assignedChallengers.includes(user.name),
      )
    : [];
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);

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
        onSubmit={(event) => {
          event.preventDefault();
          if (selectedMembers.length === 0) return;
          void recruitObjectiveChallengers(objective.id, selectedMembers).then((ok) => {
            if (ok) closeModal();
          });
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
              <input checked={selectedMembers.includes(user.name)} onChange={() => toggleMember(user.name)} type="checkbox" />
            </label>
          ))}
          {candidates.length === 0 && <div className="rounded-lg border orf-border px-3 py-6 text-center text-sm orf-text-secondary">没有可征召的成员。</div>}
        </div>
        <div className="flex justify-end gap-2"><Button variant="secondary" type="button" onClick={closeModal}>取消</Button><Button disabled={selectedMembers.length === 0} type="submit">发送征召</Button></div>
      </form>
    </ModalFrame>
  );
}

function defaultFinalDueAt() {
  const date = new Date();
  date.setDate(date.getDate() + 14);
  return localDateString(date);
}

function defaultCycleLabel() {
  const date = new Date();
  const quarter = Math.floor(date.getMonth() / 3) + 1;
  return `${date.getFullYear()} Q${quarter}`;
}

function NewObjectiveModal() {
  const { createObjective, closeModal } = useOrf();
  const [title, setTitle] = useState("");
  const [whyItMatters, setWhyItMatters] = useState("");
  const [cycle, setCycle] = useState(() => defaultCycleLabel());
  const [boundary, setBoundary] = useState("");
  const [finalDueAt, setFinalDueAt] = useState(() => defaultFinalDueAt());

  return (
    <ModalFrame title="新建目标">
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          createObjective({
            title: title.trim(),
            whyItMatters: whyItMatters.trim(),
            cycle: cycle.trim(),
            boundary: boundary.trim(),
            finalDueAt,
          });
          closeModal();
        }}
      >
        <Field label="目标标题"><input className="orf-input px-3 py-2" required value={title} onChange={(event) => setTitle(event.target.value)} /></Field>
        <Field label="为什么重要"><textarea className="orf-input min-h-24 px-3 py-2" required value={whyItMatters} onChange={(event) => setWhyItMatters(event.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="周期"><input className="orf-input px-3 py-2" required value={cycle} onChange={(event) => setCycle(event.target.value)} /></Field>
          <Field label="最终截止时间"><input className="orf-input px-3 py-2" type="date" value={finalDueAt} onChange={(event) => setFinalDueAt(event.target.value)} required /></Field>
        </div>
        <Field label="边界 / 不做什么"><textarea className="orf-input min-h-20 px-3 py-2" required value={boundary} onChange={(event) => setBoundary(event.target.value)} /></Field>
        <div className="flex justify-end gap-2"><Button variant="secondary" type="button" onClick={closeModal}>取消</Button><Button type="submit">保存目标</Button></div>
      </form>
    </ModalFrame>
  );
}

function NewResultModal({ objectiveId, source = "managerDefined" }: { objectiveId?: string; source?: "managerDefined" | "memberProposed" }) {
  const { state, createResult, closeModal } = useOrf();
  const [selectedObjectiveId, setSelectedObjectiveId] = useState(objectiveId ?? state.objectives[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [metricName, setMetricName] = useState("");

  return (
    <ModalFrame title={source === "memberProposed" ? "提出指标" : "新增指标"}>
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          createResult({ objectiveId: selectedObjectiveId, title: title.trim(), metricName: metricName.trim(), source });
          closeModal();
        }}
      >
        <Field label="所属目标"><select className="orf-input px-3 py-2" required value={selectedObjectiveId} onChange={(event) => setSelectedObjectiveId(event.target.value)}>{state.objectives.map((objective) => <option key={objective.id} value={objective.id}>{objective.title}</option>)}</select></Field>
        <Field label="指标标题"><input className="orf-input px-3 py-2" required value={title} onChange={(event) => setTitle(event.target.value)} /></Field>
        <Field label="衡量指标"><input className="orf-input px-3 py-2" required value={metricName} onChange={(event) => setMetricName(event.target.value)} /></Field>
        <div className="flex justify-end gap-2"><Button variant="secondary" type="button" onClick={closeModal}>取消</Button><Button type="submit">{source === "memberProposed" ? "提交指标" : "保存指标"}</Button></div>
      </form>
    </ModalFrame>
  );
}

function NewFeedbackModal({ objectiveId, resultId }: { objectiveId?: string; resultId?: string }) {
  const { state, createFeedback, closeModal, currentUser } = useOrf();
  const defaultOwner = currentUser?.name ?? state.users.find((user) => user.id === state.currentUserId)?.name ?? state.users[0]?.name ?? "User";
  const resultOptions = objectiveId ? state.results.filter((result) => result.objectiveId === objectiveId) : state.results;
  const initialResultId = resultId && resultOptions.some((result) => result.id === resultId) ? resultId : resultOptions[0]?.id ?? state.results[0]?.id ?? "";
  const [linkedResultId, setLinkedResultId] = useState(initialResultId);
  const selectedResult = resultOptions.find((result) => result.id === linkedResultId) ?? (!objectiveId ? state.results.find((result) => result.id === linkedResultId) : undefined);
  const [phenomenon, setPhenomenon] = useState("");
  const [cause, setCause] = useState(state.causeCategories[0] ?? "");
  const [impact, setImpact] = useState<Impact>("Medium");
  const [source, setSource] = useState<FeedbackSource>("User report");
  const [owner, setOwner] = useState(defaultOwner);
  const [suggestedAdjustment, setSuggestedAdjustment] = useState("");

  return (
    <ModalFrame title="新建反馈">
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!selectedResult) {
            return;
          }

          createFeedback({
            phenomenon: phenomenon.trim(),
            causeCategories: [cause],
            impact,
            linkedObjectiveId: selectedResult.objectiveId,
            linkedResultId,
            suggestedAdjustment: suggestedAdjustment.trim(),
            source,
            owner: owner.trim(),
          });
          closeModal();
        }}
      >
        <Field label="现象"><textarea className="orf-input min-h-24 px-3 py-2" required value={phenomenon} onChange={(event) => setPhenomenon(event.target.value)} /></Field>
        <Field label="关联指标"><select className="orf-input px-3 py-2" required value={linkedResultId} onChange={(event) => setLinkedResultId(event.target.value)}>{resultOptions.map((result) => <option key={result.id} value={result.id}>{result.title}</option>)}</select></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="原因分类"><select className="orf-input px-3 py-2" required value={cause} onChange={(event) => setCause(event.target.value)}>{state.causeCategories.map((item) => <option key={item}>{item}</option>)}</select></Field>
          <Field label="影响"><select className="orf-input px-3 py-2" value={impact} onChange={(event) => setImpact(event.target.value as Impact)}>{["Low", "Medium", "High", "Critical"].map((item) => <option key={item} value={item}>{item === "Low" ? "低" : item === "Medium" ? "中" : item === "High" ? "高" : "严重"}</option>)}</select></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="来源"><select className="orf-input px-3 py-2" value={source} onChange={(event) => setSource(event.target.value as FeedbackSource)}>{["User report", "Eval run", "Log", "Incident", "Team review"].map((item) => <option key={item} value={item}>{item === "User report" ? "用户反馈" : item === "Eval run" ? "评估运行" : item === "Log" ? "日志" : item === "Incident" ? "事故" : "团队复盘"}</option>)}</select></Field>
          <Field label="处理人"><input className="orf-input px-3 py-2" required value={owner} onChange={(event) => setOwner(event.target.value)} /></Field>
        </div>
        <Field label="建议调整"><textarea className="orf-input min-h-20 px-3 py-2" required value={suggestedAdjustment} onChange={(event) => setSuggestedAdjustment(event.target.value)} /></Field>
        <div className="flex justify-end gap-2"><Button variant="secondary" type="button" onClick={closeModal}>取消</Button><Button type="submit">保存反馈</Button></div>
      </form>
    </ModalFrame>
  );
}

function NewTaskModal({ objectiveId, resultId, feedbackId }: { objectiveId?: string; resultId?: string; feedbackId?: string }) {
  const { state, createTask, closeModal, currentUser } = useOrf();
  const defaultAssignee = currentUser?.name ?? state.users.find((user) => user.id === state.currentUserId)?.name ?? state.users[0]?.name ?? "User";
  const linkedFeedback = state.feedback.find((item) => item.id === feedbackId);
  const resultOptions = objectiveId ? state.results.filter((result) => result.objectiveId === objectiveId) : state.results;
  const requestedResultId = resultId ?? linkedFeedback?.linkedResultId;
  const initialResultId = requestedResultId && resultOptions.some((result) => result.id === requestedResultId) ? requestedResultId : resultOptions[0]?.id ?? state.results[0]?.id ?? "";
  const [linkedResultId, setLinkedResultId] = useState(initialResultId);
  const selectedResult = resultOptions.find((result) => result.id === linkedResultId) ?? (!objectiveId ? state.results.find((result) => result.id === linkedResultId) : undefined);
  const [title, setTitle] = useState(linkedFeedback ? `处理反馈：${linkedFeedback.causeCategories.join(" + ")}` : "");
  const [description, setDescription] = useState(linkedFeedback?.suggestedAdjustment ?? "");
  const [assignee, setAssignee] = useState(defaultAssignee);
  const [priority, setPriority] = useState<Priority>("High");

  return (
    <ModalFrame title="新建行动项">
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!selectedResult) {
            return;
          }

          createTask({
            title: title.trim(),
            description: description.trim(),
            assignee: assignee.trim(),
            priority,
            linkedObjectiveId: selectedResult.objectiveId,
            linkedResultId,
            feedbackOriginId: feedbackId,
          });
          closeModal();
        }}
      >
        <Field label="行动项标题"><input className="orf-input px-3 py-2" required value={title} onChange={(event) => setTitle(event.target.value)} /></Field>
        <Field label="说明"><textarea className="orf-input min-h-24 px-3 py-2" value={description} onChange={(event) => setDescription(event.target.value)} /></Field>
        <Field label="关联指标"><select className="orf-input px-3 py-2" required value={linkedResultId} onChange={(event) => setLinkedResultId(event.target.value)}>{resultOptions.map((result) => <option key={result.id} value={result.id}>{result.title}</option>)}</select></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="执行人"><input className="orf-input px-3 py-2" value={assignee} onChange={(event) => setAssignee(event.target.value)} /></Field>
          <Field label="优先级"><select className="orf-input px-3 py-2" value={priority} onChange={(event) => setPriority(event.target.value as Priority)}>{["Low", "Medium", "High", "Critical"].map((item) => <option key={item} value={item}>{item === "Low" ? "低" : item === "Medium" ? "中" : item === "High" ? "高" : "紧急"}</option>)}</select></Field>
        </div>
        <div className="flex justify-end gap-2"><Button variant="secondary" type="button" onClick={closeModal}>取消</Button><Button type="submit">保存行动项</Button></div>
      </form>
    </ModalFrame>
  );
}

function ResultUpdateModal({ resultId, feedbackId }: { resultId?: string; feedbackId?: string }) {
  const { state, proposeResultUpdate, closeModal } = useOrf();
  const result = state.results.find((item) => item.id === resultId) ?? state.results[0];
  const feedback = feedbackId ? state.feedback.find((item) => item.id === feedbackId) : undefined;
  const [title, setTitle] = useState(result?.title ?? "");
  const [reason, setReason] = useState(feedback?.suggestedAdjustment ?? "");

  if (!result) return null;

  return (
    <ModalFrame title="提出指标更新">
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          proposeResultUpdate(result.id, title.trim(), reason.trim(), feedbackId);
          closeModal();
        }}
      >
        <div className="orf-surface-muted orf-text-secondary rounded-lg border orf-border p-3 text-sm">当前指标：<span className="orf-text-primary">{result.title}</span></div>
        <Field label="更新后的指标"><textarea className="orf-input min-h-20 px-3 py-2" required value={title} onChange={(event) => setTitle(event.target.value)} /></Field>
        <Field label="修改原因"><textarea className="orf-input min-h-24 px-3 py-2" required value={reason} onChange={(event) => setReason(event.target.value)} /></Field>
        <div className="flex justify-end gap-2"><Button variant="secondary" type="button" onClick={closeModal}>取消</Button><Button type="submit">记录更新</Button></div>
      </form>
    </ModalFrame>
  );
}
