import type { DragEvent } from "react";
import type { Result, Task, TaskChecklistItem } from "../../../types/orf";
import type { DragDropController, DragItem, DropPlacement, DropTarget } from "./types";

type DropTargetMatch =
  | { type: "bounty"; bountyId: string }
  | { type: "bountyActions"; bountyId: string }
  | { type: "action"; actionId: string }
  | { type: "actionSubActions"; actionId: string }
  | { type: "subAction"; actionId: string; itemId: string };

export function bountyDropTargetForEvent(dragItem: DragItem | null, bounty: Result, event: DragEvent<HTMLElement>): DropTarget | null {
  if (!dragItem) return null;
  if (dragItem.type === "bounty") return { type: "bounty", bountyId: bounty.id, objectiveId: bounty.objectiveId, placement: dropPlacementFromEvent(event) };
  if (dragItem.type === "action") return { type: "bountyActions", bountyId: bounty.id, objectiveId: bounty.objectiveId };
  return null;
}

export function actionDropTargetForEvent(dragItem: DragItem | null, action: Task, event: DragEvent<HTMLElement>): DropTarget | null {
  if (!dragItem) return null;
  if (dragItem.type === "action") {
    return {
      type: "action",
      actionId: action.id,
      bountyId: action.linkedResultId,
      objectiveId: action.linkedObjectiveId,
      placement: dropPlacementFromEvent(event),
    };
  }
  if (dragItem.type === "subAction") return { type: "actionSubActions", actionId: action.id };
  return null;
}

export function subActionDropTargetForEvent(dragItem: DragItem | null, action: Task, item: TaskChecklistItem, event: DragEvent<HTMLElement>): DropTarget | null {
  if (dragItem?.type !== "subAction") return null;
  return { type: "subAction", actionId: action.id, itemId: item.id, placement: dropPlacementFromEvent(event) };
}

export function canDropItem(dragItem: DragItem, target: DropTarget) {
  if (dragItem.type === "bounty") {
    return target.type === "bounty" && target.objectiveId === dragItem.objectiveId && target.bountyId !== dragItem.id;
  }

  if (dragItem.type === "action") {
    if (target.type === "bountyActions") return true;
    return target.type === "action" && target.actionId !== dragItem.id;
  }

  if (target.type === "actionSubActions") return true;
  return target.type === "subAction" && target.itemId !== dragItem.id;
}

export function handleRowDragOver(event: DragEvent<HTMLElement>, dragDrop: DragDropController, target: DropTarget | null) {
  if (!dragDrop.dragItem || !target || !canDropItem(dragDrop.dragItem, target)) return;
  event.preventDefault();
  event.stopPropagation();
  event.dataTransfer.dropEffect = "move";
  dragDrop.onDropTargetChange(target);
}

export function handleRowDrop(event: DragEvent<HTMLElement>, dragDrop: DragDropController, target: DropTarget | null) {
  if (!dragDrop.dragItem || !target || !canDropItem(dragDrop.dragItem, target)) return;
  event.preventDefault();
  event.stopPropagation();
  dragDrop.onDrop(target);
}

export function handleRowDragLeave(event: DragEvent<HTMLElement>, dragDrop: DragDropController) {
  if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
  dragDrop.onDropTargetChange(null);
}

export function dropTargetClass(target: DropTarget | null, matches: DropTargetMatch[]) {
  if (!target) return undefined;

  for (const match of matches) {
    if (target.type === "bounty" && match.type === "bounty" && target.bountyId === match.bountyId) {
      return target.placement === "before" ? "orf-drop-target-before" : "orf-drop-target-after";
    }

    if (target.type === "bountyActions" && match.type === "bountyActions" && target.bountyId === match.bountyId) {
      return "orf-drop-target-inside";
    }

    if (target.type === "action" && match.type === "action" && target.actionId === match.actionId) {
      return target.placement === "before" ? "orf-drop-target-before" : "orf-drop-target-after";
    }

    if (target.type === "actionSubActions" && match.type === "actionSubActions" && target.actionId === match.actionId) {
      return "orf-drop-target-inside";
    }

    if (target.type === "subAction" && match.type === "subAction" && target.actionId === match.actionId && target.itemId === match.itemId) {
      return target.placement === "before" ? "orf-drop-target-before" : "orf-drop-target-after";
    }
  }

  return undefined;
}

function dropPlacementFromEvent(event: DragEvent<HTMLElement>): DropPlacement {
  const rect = event.currentTarget.getBoundingClientRect();
  return event.clientY < rect.top + rect.height / 2 ? "before" : "after";
}
