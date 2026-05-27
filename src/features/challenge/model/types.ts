import type { BountySource, CommentTargetType, Objective, Result, Task, TaskChecklistItem } from "../../../types/orf";

export type ChallengeScope = "all" | "mine";
export type BountyStatus = "open" | "active" | "review" | "settled";
export type ActionVisualStatus = "todo" | "active" | "done";
export type DropPlacement = "before" | "after";
export type ChallengeRowAction = "copyLink" | "edit" | "comment" | "delete";

export type ChallengeTarget =
  | { type: "objective"; id: string; title: string }
  | { type: "bounty"; id: string; title: string; objectiveId: string }
  | { type: "action"; id: string; title: string; objectiveId: string; hasSubActions: boolean }
  | { type: "subAction"; id: string; title: string; actionId: string; objectiveId: string };

export type ChallengeRowPersistence = "persisted" | "temporary";
export type TemporaryChildRowKind = "metric" | "action" | "subtask";
export type TemporaryChildRowStatus = "idle" | "editing" | "submitting" | "failed";
export type TemporaryChildRow = {
  id: string;
  kind: TemporaryChildRowKind;
  objectiveId: string;
  persistence: "temporary";
  taskId?: string;
  afterItemId?: string;
  source?: BountySource;
  status: TemporaryChildRowStatus;
  title: string;
};

const temporaryChildRowIdPrefix = "__orf-temporary-child__";

export function temporaryChildRowId(kind: TemporaryChildRowKind, parentId: string) {
  return `${temporaryChildRowIdPrefix}:${kind}:${parentId}`;
}

export function parseTemporaryChildRowId(id: string): { kind: TemporaryChildRowKind; parentId: string } | null {
  const [prefix, kind, parentId] = id.split(":");
  if (prefix !== temporaryChildRowIdPrefix || (kind !== "metric" && kind !== "action" && kind !== "subtask") || !parentId) return null;
  return { kind, parentId };
}

export function isTemporaryChildTarget(target: ChallengeTarget) {
  return parseTemporaryChildRowId(target.id) !== null;
}

export function temporaryChildTarget(row: TemporaryChildRow): ChallengeTarget {
  if (row.kind === "metric") {
    return { type: "bounty", id: row.id, title: row.title, objectiveId: row.objectiveId };
  }

  if (row.kind === "subtask") {
    return { type: "subAction", id: row.id, title: row.title, actionId: row.taskId ?? "", objectiveId: row.objectiveId };
  }

  return { type: "action", id: row.id, title: row.title, objectiveId: row.objectiveId, hasSubActions: false };
}

export type ChallengeCommentTarget = {
  id: string;
  title: string;
  type: CommentTargetType;
};

export type DragItem =
  | { type: "bounty"; id: string; objectiveId: string }
  | { type: "action"; id: string; objectiveId: string }
  | { type: "subAction"; id: string; actionId: string };

export type DropTarget =
  | { type: "bounty"; bountyId: string; objectiveId: string; placement: DropPlacement }
  | { type: "objectiveActions"; objectiveId: string }
  | { type: "action"; actionId: string; objectiveId: string; placement: DropPlacement }
  | { type: "actionSubActions"; actionId: string }
  | { type: "subAction"; actionId: string; itemId: string; placement: DropPlacement };

export type DragDropController = {
  dragItem: DragItem | null;
  dropTarget: DropTarget | null;
  onDragStart: (item: DragItem) => void;
  onDragEnd: () => void;
  onDropTargetChange: (target: DropTarget | null) => void;
  onDrop: (target: DropTarget) => void;
};

export interface BountyNode {
  difficulty: string;
  progress: number;
  result: Result;
  status: BountyStatus;
  updatedAt: string;
}

export interface ObjectiveNode {
  actions: Task[];
  bounties: BountyNode[];
  challengers: string[];
  deadline: string;
  objective: Objective;
}

export type SubActionNode = {
  action: Task;
  item: TaskChecklistItem;
};
