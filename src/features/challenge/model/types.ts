import type { CommentTargetType, Objective, Result, Task, TaskChecklistItem } from "../../../types/orf";

export type ChallengeScope = "all" | "mine";
export type BountyStatus = "open" | "active" | "review" | "accepted" | "settled";
export type ActionVisualStatus = "todo" | "active" | "done";
export type DropPlacement = "before" | "after";
export type ChallengeRowAction = "copyLink" | "edit" | "comment" | "delete";

export type ChallengeTarget =
  | { type: "objective"; id: string; title: string }
  | { type: "bounty"; id: string; title: string; objectiveId: string }
  | { type: "action"; id: string; title: string; objectiveId: string; hasSubActions: boolean }
  | { type: "subAction"; id: string; title: string; actionId: string; objectiveId: string };

export type ChallengeRowPersistence = "persisted" | "temporary";

export type ChallengeCommentTarget = {
  id: string;
  title: string;
  type: CommentTargetType;
};

export type DragItem =
  | { type: "objective"; id: string; projectId: string | null }
  | { type: "bounty"; id: string; objectiveId: string }
  | { type: "action"; id: string; objectiveId: string }
  | { type: "subAction"; id: string; actionId: string };

export type DropTarget =
  | { type: "project"; projectId: string | null }
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
