import type { Feedback, Objective, OrfUser, Result, Task } from "../../../types/orf";

export function canViewObjectiveRecord(objective: Objective | undefined, currentUser: OrfUser | null | undefined) {
  if (!objective || !currentUser) return false;
  if (currentUser.role === "admin") return true;
  return objective.challengers.includes(currentUser.name);
}

export function visibleObjectivesForUser(objectives: readonly Objective[], currentUser: OrfUser | null | undefined) {
  if (currentUser?.role === "admin") return [...objectives];
  return objectives.filter((objective) => canViewObjectiveRecord(objective, currentUser));
}

export function visibleObjectiveIdsForUser(objectives: readonly Objective[], currentUser: OrfUser | null | undefined) {
  return new Set(visibleObjectivesForUser(objectives, currentUser).map((objective) => objective.id));
}

export function filterResultsForVisibleObjectives(results: readonly Result[], visibleObjectiveIds: ReadonlySet<string>) {
  return results.filter((result) => visibleObjectiveIds.has(result.objectiveId));
}

export function filterTasksForVisibleObjectives(tasks: readonly Task[], visibleObjectiveIds: ReadonlySet<string>) {
  return tasks.filter((task) => visibleObjectiveIds.has(task.linkedObjectiveId));
}

export function filterFeedbackForVisibleObjectives(feedback: readonly Feedback[], visibleObjectiveIds: ReadonlySet<string>) {
  return feedback.filter((item) => visibleObjectiveIds.has(item.linkedObjectiveId));
}
