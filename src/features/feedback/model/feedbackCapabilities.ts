import type { Feedback, Objective, OrfState, OrfUser, Result } from "../../../types/orf";

export function canManageFeedbackStatus(feedback: Feedback, currentUser: OrfUser | null) {
  if (!currentUser) {
    return false;
  }

  return currentUser.role === "admin" || feedback.createdBy === currentUser.id || feedback.ownerUserId === currentUser.id;
}

export function canCreateFeedbackFromResults(results: readonly Result[]) {
  return results.length > 0;
}

export function canCreateFeedbackForObjective(objective: Objective | undefined, currentUser: OrfUser | null, results: readonly Result[]) {
  if (!objective || !currentUser || results.length === 0) {
    return false;
  }

  return currentUser.role === "admin" || (objective.challengerUserIds ?? []).includes(currentUser.id);
}

export function canCreateFeedbackForResult(objective: Objective | undefined, currentUser: OrfUser | null, result: Result | undefined) {
  return Boolean(result && canCreateFeedbackForObjective(objective, currentUser, [result]));
}

export function canCreateFeedbackFromVisibleState(state: Pick<OrfState, "objectives" | "results">, currentUser: OrfUser | null) {
  return state.results.some((result) =>
    canCreateFeedbackForResult(
      state.objectives.find((objective) => objective.id === result.objectiveId),
      currentUser,
      result,
    ),
  );
}
