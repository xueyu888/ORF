import type { BountySource, OrfState, Result, Task, TaskChecklistItem } from "../../../types/orf";
import type { ChallengeTarget } from "./types";

export type ChildCreationKind = "metric" | "action" | "subtask";

export type ChildCreationDraft = {
  id: string;
  kind: ChildCreationKind;
  objectiveId: string;
  taskId?: string;
  afterItemId?: string;
  source?: BountySource;
  title: string;
};

export type ChildCreationTemporaryStatus = "editing" | "submitting" | "failed";

export type ChildCreationTemporaryRow = ChildCreationDraft & {
  persistence: "temporary";
  status: ChildCreationTemporaryStatus;
};

export type ChildCreationOverlay =
  | { kind: "metric"; result: Result }
  | { kind: "action"; task: Task }
  | { kind: "subtask"; taskId: string; item: TaskChecklistItem; afterItemId?: string };

export type ChildCreationSession =
  | { status: "idle" }
  | { status: "editingDraft"; draft: ChildCreationDraft }
  | { status: "submittingDraft"; draft: ChildCreationDraft; submissionId: string }
  | { status: "failedEditingDraft"; draft: ChildCreationDraft }
  | { status: "submittedOverlay"; overlay: ChildCreationOverlay };

export const idleChildCreationSession: ChildCreationSession = { status: "idle" };

const childCreationDraftIdPrefix = "__orf-child-creation__";

export function childCreationDraftId(kind: ChildCreationKind, parentId: string) {
  return `${childCreationDraftIdPrefix}:${kind}:${parentId}`;
}

export function parseChildCreationDraftId(id: string): { kind: ChildCreationKind; parentId: string } | null {
  const [prefix, kind, parentId] = id.split(":");
  if (prefix !== childCreationDraftIdPrefix || (kind !== "metric" && kind !== "action" && kind !== "subtask") || !parentId) return null;
  return { kind, parentId };
}

export function isChildCreationTarget(target: ChallengeTarget) {
  return parseChildCreationDraftId(target.id) !== null;
}

export function childCreationTarget(row: ChildCreationDraft | ChildCreationTemporaryRow): ChallengeTarget {
  if (row.kind === "metric") {
    return { type: "bounty", id: row.id, title: row.title, objectiveId: row.objectiveId };
  }

  if (row.kind === "subtask") {
    return { type: "subAction", id: row.id, title: row.title, actionId: row.taskId ?? "", objectiveId: row.objectiveId };
  }

  return { type: "action", id: row.id, title: row.title, objectiveId: row.objectiveId, hasSubActions: false };
}

export function beginChildCreationSession(current: ChildCreationSession, draft: ChildCreationDraft): ChildCreationSession {
  if (current.status === "idle") return { status: "editingDraft", draft };

  if (current.status === "editingDraft" || current.status === "failedEditingDraft") {
    if (current.draft.id !== draft.id) return current;
    return { status: "editingDraft", draft: { ...draft, title: current.draft.title } };
  }

  return current;
}

export function updateChildCreationDraftTitle(current: ChildCreationSession, title: string): ChildCreationSession {
  if (current.status !== "editingDraft" && current.status !== "failedEditingDraft") return current;
  return { ...current, draft: { ...current.draft, title } };
}

export function submitChildCreationDraft(current: ChildCreationSession, title: string, submissionId: string): ChildCreationSession {
  if (current.status !== "editingDraft" && current.status !== "failedEditingDraft") return current;
  return { status: "submittingDraft", draft: { ...current.draft, title }, submissionId };
}

export function completeChildCreationDraft(
  current: ChildCreationSession,
  submitting: ChildCreationSession,
  overlay: ChildCreationOverlay,
): ChildCreationSession {
  if (!sameSubmittingDraft(current, submitting)) return current;
  if (current.status !== "submittingDraft" || !childCreationOverlayMatchesDraft(overlay, current.draft)) return current;
  return { status: "submittedOverlay", overlay };
}

export function failChildCreationDraft(current: ChildCreationSession, submitting: ChildCreationSession): ChildCreationSession {
  if (!sameSubmittingDraft(current, submitting)) return current;
  if (current.status !== "submittingDraft") return current;
  return { status: "failedEditingDraft", draft: current.draft };
}

export function cancelChildCreationSession(current: ChildCreationSession): ChildCreationSession {
  return current.status === "editingDraft" || current.status === "failedEditingDraft" ? idleChildCreationSession : current;
}

export function clearChildCreationSession(): ChildCreationSession {
  return idleChildCreationSession;
}

export function clearSubmittedChildCreation(current: ChildCreationSession): ChildCreationSession {
  return current.status === "submittedOverlay" ? idleChildCreationSession : current;
}

export function materializeSubmittedChildCreation(current: ChildCreationSession, data: OrfState): ChildCreationSession {
  if (current.status !== "submittedOverlay") return current;
  return childCreationOverlayMaterialized(data, current.overlay) ? idleChildCreationSession : current;
}

export function childCreationDraft(current: ChildCreationSession): ChildCreationDraft | null {
  if (current.status === "editingDraft" || current.status === "failedEditingDraft" || current.status === "submittingDraft") {
    return current.draft;
  }

  return null;
}

export function childCreationTemporaryRow(current: ChildCreationSession): ChildCreationTemporaryRow | null {
  if (current.status === "editingDraft") return { ...current.draft, persistence: "temporary", status: "editing" };
  if (current.status === "failedEditingDraft") return { ...current.draft, persistence: "temporary", status: "failed" };
  if (current.status === "submittingDraft") return { ...current.draft, persistence: "temporary", status: "submitting" };
  return null;
}

export function childCreationSubmittedOverlay(current: ChildCreationSession): ChildCreationOverlay | null {
  return current.status === "submittedOverlay" ? current.overlay : null;
}

export function childCreationIsSubmitting(current: ChildCreationSession) {
  return current.status === "submittingDraft";
}

export function childCreationIsAwaitingSnapshot(current: ChildCreationSession) {
  return current.status === "submittedOverlay";
}

export function childCreationOverlayMatchesTarget(session: ChildCreationSession, target: ChallengeTarget) {
  const overlay = childCreationSubmittedOverlay(session);
  if (!overlay) return false;
  if (overlay.kind === "metric") return target.type === "bounty" && target.id === overlay.result.id;
  if (overlay.kind === "action") return target.type === "action" && target.id === overlay.task.id;
  return target.type === "subAction" && target.id === overlay.item.id;
}

export function childCreationOverlayMaterialized(data: OrfState, overlay: ChildCreationOverlay) {
  if (overlay.kind === "metric") {
    return data.results.some((result) => result.id === overlay.result.id);
  }

  if (overlay.kind === "action") {
    return data.tasks.some((task) => task.id === overlay.task.id);
  }

  return data.tasks.some((task) => task.id === overlay.taskId && task.checklist.some((item) => item.id === overlay.item.id));
}

export function applyChildCreationOverlay(data: OrfState, overlay: ChildCreationOverlay | null): OrfState {
  if (!overlay || childCreationOverlayMaterialized(data, overlay)) return data;

  if (overlay.kind === "metric") {
    return {
      ...data,
      objectives: data.objectives.map((objective) =>
        objective.id === overlay.result.objectiveId && !objective.resultIds.includes(overlay.result.id)
          ? { ...objective, resultIds: [...objective.resultIds, overlay.result.id] }
          : objective,
      ),
      results: [...data.results, overlay.result],
    };
  }

  if (overlay.kind === "action") {
    return {
      ...data,
      objectives: data.objectives.map((objective) =>
        objective.id === overlay.task.linkedObjectiveId && !objective.taskIds.includes(overlay.task.id)
          ? { ...objective, taskIds: [...objective.taskIds, overlay.task.id] }
          : objective,
      ),
      tasks: [...data.tasks, overlay.task],
    };
  }

  return {
    ...data,
    tasks: data.tasks.map((task) => (task.id === overlay.taskId ? { ...task, checklist: insertChecklistOverlay(task.checklist, overlay.item, overlay.afterItemId) } : task)),
  };
}

function sameSubmittingDraft(current: ChildCreationSession, submitting: ChildCreationSession) {
  return (
    current.status === "submittingDraft" &&
    submitting.status === "submittingDraft" &&
    current.submissionId === submitting.submissionId
  );
}

function childCreationOverlayMatchesDraft(overlay: ChildCreationOverlay, draft: ChildCreationDraft) {
  if (overlay.kind === "metric") {
    return draft.kind === "metric" && overlay.result.objectiveId === draft.objectiveId;
  }

  if (overlay.kind === "action") {
    return draft.kind === "action" && overlay.task.linkedObjectiveId === draft.objectiveId;
  }

  return draft.kind === "subtask" && overlay.taskId === draft.taskId;
}

function insertChecklistOverlay(items: TaskChecklistItem[], item: TaskChecklistItem, afterItemId?: string) {
  if (items.some((current) => current.id === item.id)) return items;

  const next = [...items];
  const afterIndex = afterItemId ? next.findIndex((current) => current.id === afterItemId) : -1;
  next.splice(afterIndex >= 0 ? afterIndex + 1 : next.length, 0, item);
  return next;
}
