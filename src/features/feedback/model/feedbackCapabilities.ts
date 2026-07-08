import type { Feedback, OrfState, OrfUser } from "../../../types/orf";

export function canManageFeedbackStatus(feedback: Feedback, currentUser: OrfUser | null) {
  if (!currentUser) {
    return false;
  }

  return currentUser.role === "admin" || feedback.createdBy === currentUser.id || feedback.ownerUserId === currentUser.id;
}

export function canEditFeedbackMetadata(feedback: Feedback, currentUser: OrfUser | null) {
  if (!currentUser) {
    return false;
  }
  if (currentUser.role === "admin") {
    return true;
  }
  if (feedback.status === "Closed") {
    return false;
  }
  return feedback.createdBy === currentUser.id || feedback.ownerUserId === currentUser.id;
}

export function canCreateTeamFeedback(currentUser: OrfUser | null | undefined) {
  return currentUser?.status === "active";
}

export function canCreateFeedbackFromVisibleState(_state: Pick<OrfState, "objectives" | "results">, currentUser: OrfUser | null) {
  return canCreateTeamFeedback(currentUser);
}
