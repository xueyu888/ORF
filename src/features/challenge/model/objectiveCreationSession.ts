import type { Objective } from "../../../types/orf";
import type { ChallengeCycleFilter, ChallengeMemberFilter, ChallengeStatusFilter } from "./challengeFilters";
import type { ChallengeScope, ObjectiveNode } from "./types";

export const draftObjectiveId = "draft-objective";

export type DraftReturnContext = {
  cycle: ChallengeCycleFilter;
  member: ChallengeMemberFilter;
  scope: ChallengeScope;
  status: ChallengeStatusFilter;
};

export type ObjectiveDraftOrderAnchor = {
  challengerCount: number;
  createdAt: string;
  deadline: string;
  fallbackIndex: number;
  flowStatus: Objective["flowStatus"];
  nextObjectiveId: string | null;
  previousObjectiveId: string | null;
};

export type ObjectiveOrderAnchor = ObjectiveDraftOrderAnchor & {
  objectiveId: string;
};

export type ObjectiveCreationSession =
  | { status: "idle" }
  | { status: "editingDraft"; returnContext: DraftReturnContext; title: string }
  | { status: "submittingDraft"; draftOrderAnchor: ObjectiveDraftOrderAnchor | null; returnContext: DraftReturnContext; title: string }
  | { status: "failedEditingDraft"; returnContext: DraftReturnContext; title: string }
  | { status: "submittedOverlay"; objective: Objective; orderAnchor: ObjectiveOrderAnchor | null }
  | { status: "anchoredCreated"; objectiveId: string; orderAnchor: ObjectiveOrderAnchor };

export const idleObjectiveCreationSession: ObjectiveCreationSession = { status: "idle" };

export function beginObjectiveCreationSession(current: ObjectiveCreationSession, returnContext: DraftReturnContext): ObjectiveCreationSession {
  if (current.status === "editingDraft" || current.status === "failedEditingDraft" || current.status === "submittingDraft") {
    return current;
  }

  return { status: "editingDraft", returnContext, title: "" };
}

export function updateObjectiveCreationDraftTitle(current: ObjectiveCreationSession, title: string): ObjectiveCreationSession {
  if (current.status !== "editingDraft" && current.status !== "failedEditingDraft") return current;
  return { ...current, title };
}

export function submitObjectiveCreationDraft(
  current: ObjectiveCreationSession,
  title: string,
  draftOrderAnchor: ObjectiveDraftOrderAnchor | null,
): ObjectiveCreationSession {
  if (current.status !== "editingDraft" && current.status !== "failedEditingDraft") return current;
  return { status: "submittingDraft", draftOrderAnchor, returnContext: current.returnContext, title };
}

export function completeObjectiveCreationDraft(current: ObjectiveCreationSession, objective: Objective): ObjectiveCreationSession {
  if (current.status !== "submittingDraft") return current;
  return {
    status: "submittedOverlay",
    objective,
    orderAnchor: current.draftOrderAnchor ? { ...current.draftOrderAnchor, objectiveId: objective.id } : null,
  };
}

export function failObjectiveCreationDraft(current: ObjectiveCreationSession, title: string): ObjectiveCreationSession {
  if (current.status !== "submittingDraft") return current;
  return { status: "failedEditingDraft", returnContext: current.returnContext, title };
}

export function cancelObjectiveCreationSession(current: ObjectiveCreationSession): {
  returnContext: DraftReturnContext | null;
  session: ObjectiveCreationSession;
} {
  if (current.status === "editingDraft" || current.status === "failedEditingDraft") {
    return { returnContext: current.returnContext, session: idleObjectiveCreationSession };
  }

  return { returnContext: null, session: current };
}

export function clearSubmittedObjectiveCreation(current: ObjectiveCreationSession): ObjectiveCreationSession {
  return current.status === "submittedOverlay" || current.status === "anchoredCreated" ? idleObjectiveCreationSession : current;
}

export function materializeSubmittedObjectiveCreation(current: ObjectiveCreationSession): ObjectiveCreationSession {
  if (current.status !== "submittedOverlay") return current;
  if (!current.orderAnchor) return idleObjectiveCreationSession;
  return { status: "anchoredCreated", objectiveId: current.objective.id, orderAnchor: current.orderAnchor };
}

export function objectiveCreationDraftTitle(current: ObjectiveCreationSession): string | null {
  if (current.status === "editingDraft" || current.status === "failedEditingDraft" || current.status === "submittingDraft") {
    return current.title;
  }

  return null;
}

export function objectiveCreationIsDraftEditing(current: ObjectiveCreationSession) {
  return current.status === "editingDraft" || current.status === "failedEditingDraft";
}

export function objectiveCreationIsSubmitting(current: ObjectiveCreationSession) {
  return current.status === "submittingDraft";
}

export function objectiveCreationSubmittedObjective(current: ObjectiveCreationSession): Objective | null {
  return current.status === "submittedOverlay" ? current.objective : null;
}

export function objectiveCreationSubmittedOrderAnchor(current: ObjectiveCreationSession): ObjectiveOrderAnchor | null {
  if (current.status === "submittedOverlay" || current.status === "anchoredCreated") return current.orderAnchor;
  return null;
}

export function draftOrderAnchor(groups: readonly ObjectiveNode[]): ObjectiveDraftOrderAnchor | null {
  const draftIndex = groups.findIndex((group) => group.objective.id === draftObjectiveId);
  if (draftIndex < 0) return null;
  const draft = groups[draftIndex]!;
  return {
    challengerCount: draft.challengers.length,
    createdAt: draft.objective.createdAt,
    deadline: draft.deadline,
    fallbackIndex: draftIndex,
    flowStatus: draft.objective.flowStatus,
    nextObjectiveId: groups[draftIndex + 1]?.objective.id ?? null,
    previousObjectiveId: groups[draftIndex - 1]?.objective.id ?? null,
  };
}

export function applyObjectiveOrderAnchor(groups: readonly ObjectiveNode[], anchor: ObjectiveOrderAnchor | null): ObjectiveNode[] {
  if (!anchor) return [...groups];
  const currentIndex = groups.findIndex((group) => group.objective.id === anchor.objectiveId);
  if (currentIndex < 0) return [...groups];

  const anchoredGroup = groups[currentIndex]!;
  if (
    anchoredGroup.challengers.length !== anchor.challengerCount ||
    anchoredGroup.deadline !== anchor.deadline ||
    anchoredGroup.objective.createdAt !== anchor.createdAt ||
    anchoredGroup.objective.flowStatus !== anchor.flowStatus
  ) {
    return [...groups];
  }

  const remainingGroups = groups.filter((_, index) => index !== currentIndex);
  const previousIndex = anchor.previousObjectiveId ? remainingGroups.findIndex((group) => group.objective.id === anchor.previousObjectiveId) : -1;
  const nextIndex = anchor.nextObjectiveId ? remainingGroups.findIndex((group) => group.objective.id === anchor.nextObjectiveId) : -1;
  let targetIndex = Math.max(0, Math.min(anchor.fallbackIndex, remainingGroups.length));

  if (previousIndex >= 0 && nextIndex >= 0 && previousIndex < nextIndex) {
    targetIndex = previousIndex + 1;
  } else if (nextIndex >= 0) {
    targetIndex = nextIndex;
  } else if (previousIndex >= 0) {
    targetIndex = previousIndex + 1;
  }

  return [...remainingGroups.slice(0, targetIndex), anchoredGroup, ...remainingGroups.slice(targetIndex)];
}
