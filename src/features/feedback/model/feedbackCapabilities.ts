import type { Feedback, Objective, OrfState, OrfUser, Result } from "../../../types/orf";

export function canManageFeedbackStatus(feedback: Feedback, currentUser: OrfUser | null) {
  if (!currentUser) {
    return false;
  }

  return currentUser.role === "admin" || feedback.createdBy === currentUser.id || feedback.ownerUserId === currentUser.id;
}

export function canCreateTeamFeedback(currentUser: OrfUser | null | undefined) {
  return currentUser?.status === "active";
}

export function canCreateFeedbackFromResults(_results: readonly Result[], currentUser?: OrfUser | null) {
  return canCreateTeamFeedback(currentUser);
}

export function canCreateFeedbackForObjective(_objective: Objective | undefined, currentUser: OrfUser | null, _results: readonly Result[]) {
  return canCreateTeamFeedback(currentUser);
}

export function canCreateFeedbackForResult(_objective: Objective | undefined, currentUser: OrfUser | null, _result: Result | undefined) {
  return canCreateTeamFeedback(currentUser);
}

export function canCreateFeedbackFromVisibleState(_state: Pick<OrfState, "objectives" | "results">, currentUser: OrfUser | null) {
  return canCreateTeamFeedback(currentUser);
}
