import { X } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { useDraggableFloating } from "../hooks/useDraggableFloating";
import { useOrf } from "../state/OrfProvider";
import type { FeedbackSource, Impact, Priority } from "../types/orf";
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
  if (modal.type === "newResult") return <NewResultModal objectiveId={modal.objectiveId} />;
  if (modal.type === "newFeedback") return <NewFeedbackModal objectiveId={modal.objectiveId} resultId={modal.resultId} />;
  if (modal.type === "newTask") return <NewTaskModal objectiveId={modal.objectiveId} resultId={modal.resultId} feedbackId={modal.feedbackId} />;
  if (modal.type === "resultUpdate") return <ResultUpdateModal resultId={modal.resultId} feedbackId={modal.feedbackId} />;
  return null;
}

function NewObjectiveModal() {
  const { createObjective, closeModal } = useOrf();
  const [title, setTitle] = useState("降低权限策略问答中的幻觉率");
  const [whyItMatters, setWhyItMatters] = useState("权限策略回答错误会导致客户配置错误和支持升级。");
  const [owner, setOwner] = useState("Alex Chen");
  const [cycle, setCycle] = useState("2026 Q2");
  const [boundary, setBoundary] = useState("只关注 AI 应用回答行为，不扩展到身份系统内部实现。");

  return (
    <ModalFrame title="新建目标">
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          createObjective({ title, whyItMatters, owner, cycle, boundary });
          closeModal();
        }}
      >
        <Field label="目标标题"><input className="orf-input px-3 py-2" value={title} onChange={(event) => setTitle(event.target.value)} /></Field>
        <Field label="为什么重要"><textarea className="orf-input min-h-24 px-3 py-2" value={whyItMatters} onChange={(event) => setWhyItMatters(event.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="负责人"><input className="orf-input px-3 py-2" value={owner} onChange={(event) => setOwner(event.target.value)} /></Field>
          <Field label="周期"><input className="orf-input px-3 py-2" value={cycle} onChange={(event) => setCycle(event.target.value)} /></Field>
        </div>
        <Field label="边界 / 不做什么"><textarea className="orf-input min-h-20 px-3 py-2" value={boundary} onChange={(event) => setBoundary(event.target.value)} /></Field>
        <div className="flex justify-end gap-2"><Button variant="secondary" type="button" onClick={closeModal}>取消</Button><Button type="submit">保存目标</Button></div>
      </form>
    </ModalFrame>
  );
}

function NewResultModal({ objectiveId }: { objectiveId?: string }) {
  const { state, createResult, closeModal } = useOrf();
  const [selectedObjectiveId, setSelectedObjectiveId] = useState(objectiveId ?? state.objectives[0]?.id ?? "");
  const [title, setTitle] = useState("权限策略回答幻觉率降低到 3%");
  const [metricName, setMetricName] = useState("幻觉率");

  return (
    <ModalFrame title="新建结果">
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          createResult({ objectiveId: selectedObjectiveId, title, metricName, baseline: 10, current: 7, target: 3, unit: "%", direction: "decrease" });
          closeModal();
        }}
      >
        <Field label="所属目标"><select className="orf-input px-3 py-2" value={selectedObjectiveId} onChange={(event) => setSelectedObjectiveId(event.target.value)}>{state.objectives.map((objective) => <option key={objective.id} value={objective.id}>{objective.title}</option>)}</select></Field>
        <Field label="结果标题"><input className="orf-input px-3 py-2" value={title} onChange={(event) => setTitle(event.target.value)} /></Field>
        <Field label="指标"><input className="orf-input px-3 py-2" value={metricName} onChange={(event) => setMetricName(event.target.value)} /></Field>
        <div className="flex justify-end gap-2"><Button variant="secondary" type="button" onClick={closeModal}>取消</Button><Button type="submit">保存结果</Button></div>
      </form>
    </ModalFrame>
  );
}

function NewFeedbackModal({ objectiveId, resultId }: { objectiveId?: string; resultId?: string }) {
  const { state, createFeedback, closeModal } = useOrf();
  const [linkedResultId, setLinkedResultId] = useState(resultId ?? state.results[0]?.id ?? "");
  const selectedResult = state.results.find((result) => result.id === linkedResultId);
  const [phenomenon, setPhenomenon] = useState("线上回答引用了过期的权限策略文档。");
  const [cause, setCause] = useState("知识缺口");
  const [impact, setImpact] = useState<Impact>("High");
  const [source, setSource] = useState<FeedbackSource>("Log");
  const [owner, setOwner] = useState("Alex Chen");
  const [suggestedAdjustment, setSuggestedAdjustment] = useState("增加版本感知检索过滤，并补充回归用例。");

  return (
    <ModalFrame title="新建反馈">
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          createFeedback({
            phenomenon,
            causeCategories: [cause],
            impact,
            linkedObjectiveId: objectiveId ?? selectedResult?.objectiveId ?? state.objectives[0].id,
            linkedResultId,
            suggestedAdjustment,
            source,
            owner,
          });
          closeModal();
        }}
      >
        <Field label="现象"><textarea className="orf-input min-h-24 px-3 py-2" value={phenomenon} onChange={(event) => setPhenomenon(event.target.value)} /></Field>
        <Field label="关联结果"><select className="orf-input px-3 py-2" value={linkedResultId} onChange={(event) => setLinkedResultId(event.target.value)}>{state.results.map((result) => <option key={result.id} value={result.id}>{result.title}</option>)}</select></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="原因分类"><select className="orf-input px-3 py-2" value={cause} onChange={(event) => setCause(event.target.value)}>{state.causeCategories.map((item) => <option key={item}>{item}</option>)}</select></Field>
          <Field label="影响"><select className="orf-input px-3 py-2" value={impact} onChange={(event) => setImpact(event.target.value as Impact)}>{["Low", "Medium", "High", "Critical"].map((item) => <option key={item} value={item}>{item === "Low" ? "低" : item === "Medium" ? "中" : item === "High" ? "高" : "严重"}</option>)}</select></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="来源"><select className="orf-input px-3 py-2" value={source} onChange={(event) => setSource(event.target.value as FeedbackSource)}>{["User report", "Eval run", "Log", "Incident", "Team review"].map((item) => <option key={item} value={item}>{item === "User report" ? "用户反馈" : item === "Eval run" ? "评估运行" : item === "Log" ? "日志" : item === "Incident" ? "事故" : "团队复盘"}</option>)}</select></Field>
          <Field label="负责人"><input className="orf-input px-3 py-2" value={owner} onChange={(event) => setOwner(event.target.value)} /></Field>
        </div>
        <Field label="建议调整"><textarea className="orf-input min-h-20 px-3 py-2" value={suggestedAdjustment} onChange={(event) => setSuggestedAdjustment(event.target.value)} /></Field>
        <div className="flex justify-end gap-2"><Button variant="secondary" type="button" onClick={closeModal}>取消</Button><Button type="submit">保存反馈</Button></div>
      </form>
    </ModalFrame>
  );
}

function NewTaskModal({ objectiveId, resultId, feedbackId }: { objectiveId?: string; resultId?: string; feedbackId?: string }) {
  const { state, createTask, closeModal } = useOrf();
  const linkedFeedback = state.feedback.find((item) => item.id === feedbackId);
  const [linkedResultId, setLinkedResultId] = useState(resultId ?? linkedFeedback?.linkedResultId ?? state.results[0]?.id ?? "");
  const selectedResult = state.results.find((result) => result.id === linkedResultId);
  const [title, setTitle] = useState(linkedFeedback ? `处理反馈：${linkedFeedback.causeCategories.join(" + ")}` : "为 RAG 检索增加版本感知过滤");
  const [description, setDescription] = useState(linkedFeedback?.suggestedAdjustment ?? "执行支撑关联结果的下一步动作。");
  const [assignee, setAssignee] = useState("Alex Chen");
  const [priority, setPriority] = useState<Priority>("High");

  return (
    <ModalFrame title="新建任务">
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          createTask({
            title,
            description,
            assignee,
            priority,
            linkedObjectiveId: objectiveId ?? selectedResult?.objectiveId ?? state.objectives[0].id,
            linkedResultId,
            feedbackOriginId: feedbackId,
          });
          closeModal();
        }}
      >
        <Field label="任务标题"><input className="orf-input px-3 py-2" value={title} onChange={(event) => setTitle(event.target.value)} /></Field>
        <Field label="说明"><textarea className="orf-input min-h-24 px-3 py-2" value={description} onChange={(event) => setDescription(event.target.value)} /></Field>
        <Field label="关联结果"><select className="orf-input px-3 py-2" value={linkedResultId} onChange={(event) => setLinkedResultId(event.target.value)}>{state.results.map((result) => <option key={result.id} value={result.id}>{result.title}</option>)}</select></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="执行人"><input className="orf-input px-3 py-2" value={assignee} onChange={(event) => setAssignee(event.target.value)} /></Field>
          <Field label="优先级"><select className="orf-input px-3 py-2" value={priority} onChange={(event) => setPriority(event.target.value as Priority)}>{["Low", "Medium", "High", "Critical"].map((item) => <option key={item} value={item}>{item === "Low" ? "低" : item === "Medium" ? "中" : item === "High" ? "高" : "紧急"}</option>)}</select></Field>
        </div>
        <div className="flex justify-end gap-2"><Button variant="secondary" type="button" onClick={closeModal}>取消</Button><Button type="submit">保存任务</Button></div>
      </form>
    </ModalFrame>
  );
}

function ResultUpdateModal({ resultId, feedbackId }: { resultId?: string; feedbackId?: string }) {
  const { state, proposeResultUpdate, closeModal } = useOrf();
  const result = state.results.find((item) => item.id === resultId) ?? state.results[0];
  const [title, setTitle] = useState(result?.title ?? "");
  const [reason, setReason] = useState("反馈显示当前结果需要更清晰的可验证边界。");

  if (!result) return null;

  return (
    <ModalFrame title="提出结果更新">
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          proposeResultUpdate(result.id, title, reason, feedbackId);
          closeModal();
        }}
      >
        <div className="orf-surface-muted orf-text-secondary rounded-lg border orf-border p-3 text-sm">当前结果：<span className="orf-text-primary">{result.title}</span></div>
        <Field label="更新后的结果"><textarea className="orf-input min-h-20 px-3 py-2" value={title} onChange={(event) => setTitle(event.target.value)} /></Field>
        <Field label="修改原因"><textarea className="orf-input min-h-24 px-3 py-2" value={reason} onChange={(event) => setReason(event.target.value)} /></Field>
        <div className="flex justify-end gap-2"><Button variant="secondary" type="button" onClick={closeModal}>取消</Button><Button type="submit">记录更新</Button></div>
      </form>
    </ModalFrame>
  );
}
