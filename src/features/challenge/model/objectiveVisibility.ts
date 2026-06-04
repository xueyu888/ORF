import type { Feedback, Objective, OrfUser, Result, Task } from "../../../types/orf";

export function canViewObjectiveRecord(objective: Objective | undefined, currentUser: OrfUser | null | undefined) {
  if (!currentUser) return false;
  if (currentUser.role === "admin") return true;
  if (!objective) return false;
  return (objective.challengerUserIds ?? []).includes(currentUser.id);
}

export function visibleObjectivesForUser(objectives: readonly Objective[], currentUser: OrfUser | null | undefined) {
  if (currentUser?.role === "admin") return [...objectives];
  return objectives.filter((objective) => canViewObjectiveRecord(objective, currentUser));
}

export function visibleObjectiveIdsForUser(objectives: readonly Objective[], currentUser: OrfUser | null | undefined) {
  return new Set(visibleObjectivesForUser(objectives, currentUser).map((objective) => objective.id));
}

export function filterResultsForVisibleObjectives(results: readonly Result[], visibleObjectiveIds: ReadonlySet<string>, currentUser?: OrfUser | null) {
  if (currentUser?.role === "admin") return [...results];
  return results.filter((result) => visibleObjectiveIds.has(result.objectiveId));
}

export function filterTasksForVisibleObjectives(tasks: readonly Task[], visibleObjectiveIds: ReadonlySet<string>, currentUser?: OrfUser | null) {
  if (currentUser?.role === "admin") return [...tasks];
  return tasks.filter((task) => visibleObjectiveIds.has(task.linkedObjectiveId));
}

export function filterFeedbackForVisibleObjectives(feedback: readonly Feedback[], visibleObjectiveIds: ReadonlySet<string>, currentUser?: OrfUser | null) {
  if (currentUser?.role === "admin") return [...feedback];
  return feedback.filter((item) => visibleObjectiveIds.has(item.linkedObjectiveId));
}
