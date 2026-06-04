import type { Objective } from "../../../types/orf";
import { applyListItemAnchor, createListItemAnchor, type ListItemAnchor } from "../../interaction/listItemAnchor";
import type { ChallengeCycleFilter, ChallengeMemberFilter, ChallengeStatusFilter } from "./challengeFilters";
import type { ChallengeScope, ObjectiveNode } from "./types";

export const draftObjectiveId = "draft-objective";

export type DraftReturnContext = {
  cycle: ChallengeCycleFilter;
  member: ChallengeMemberFilter;
  scope: ChallengeScope;
  status: ChallengeStatusFilter;
};

export type ObjectiveCreationProject = {
  projectId: string | null;
};

export type ObjectiveDraftOrderAnchor = ListItemAnchor & {
  challengerCount: number;
  createdAt: string;
  deadline: string;
  flowStatus: Objective["flowStatus"];
};

export type ObjectiveOrderAnchor = ObjectiveDraftOrderAnchor & {
  objectiveId: string;
};

export type ObjectiveCreationSession =
  | { status: "idle" }
  | { status: "editingDraft"; project: ObjectiveCreationProject; returnContext: DraftReturnContext; title: string }
  | { status: "submittingDraft"; draftOrderAnchor: ObjectiveDraftOrderAnchor | null; project: ObjectiveCreationProject; returnContext: DraftReturnContext; title: string }
  | { status: "failedEditingDraft"; project: ObjectiveCreationProject; returnContext: DraftReturnContext; title: string }
  | { status: "submittedOverlay"; objective: Objective; orderAnchor: ObjectiveOrderAnchor | null }
  | { status: "anchoredCreated"; objectiveId: string; orderAnchor: ObjectiveOrderAnchor };

export const idleObjectiveCreationSession: ObjectiveCreationSession = { status: "idle" };

export function beginObjectiveCreationSession(
  current: ObjectiveCreationSession,
  returnContext: DraftReturnContext,
  project: ObjectiveCreationProject = { projectId: null },
): ObjectiveCreationSession {
  if (current.status === "editingDraft" || current.status === "failedEditingDraft" || current.status === "submittingDraft") {
    return current;
  }

  return { status: "editingDraft", project, returnContext, title: "" };
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
  return { status: "submittingDraft", draftOrderAnchor, project: current.project, returnContext: current.returnContext, title };
}

export function completeObjectiveCreationDraft(current: ObjectiveCreationSession, objective: Objective): ObjectiveCreationSession {
  if (current.status !== "submittingDraft") return current;
  return {
    status: "submittedOverlay",
    objective,
    orderAnchor: current.draftOrderAnchor ? { ...current.draftOrderAnchor, itemId: objective.id, objectiveId: objective.id } : null,
  };
}

export function failObjectiveCreationDraft(current: ObjectiveCreationSession, title: string): ObjectiveCreationSession {
  if (current.status !== "submittingDraft") return current;
  return { status: "failedEditingDraft", project: current.project, returnContext: current.returnContext, title };
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

export function objectiveCreationDraftProject(current: ObjectiveCreationSession): ObjectiveCreationProject | null {
  if (current.status === "editingDraft" || current.status === "failedEditingDraft" || current.status === "submittingDraft") {
    return current.project;
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
  const anchor = createListItemAnchor(groups, draftObjectiveId, objectiveGroupId);
  if (!anchor) return null;

  const draft = groups.find((group) => group.objective.id === draftObjectiveId)!;
  return {
    ...anchor,
    challengerCount: draft.challengers.length,
    createdAt: draft.objective.createdAt,
    deadline: draft.deadline,
    flowStatus: draft.objective.flowStatus,
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

  return applyListItemAnchor(groups, anchor, objectiveGroupId);
}

function objectiveGroupId(group: ObjectiveNode) {
  return group.objective.id;
}
