import { canMutateObjectiveWorkItemsByFlow } from "../orfLifecycle";
import { isObjectiveChallenger } from "../orfObjectiveParticipants";
import type { Objective, OrfUser, Task } from "../../types/orf";

export type ObjectiveTaskOwner = Pick<Objective, "id" | "taskIds">;
export type ObjectiveOwnedTask = Pick<Task, "id" | "linkedObjectiveId">;
export type ObjectiveWorkItemMutationAccess =
  | { status: "allowed" }
  | { status: "blocked"; reason: "notFound" | "lifecycleLocked" | "forbidden" };

type ObjectiveWorkItemTarget = Pick<Objective, "challengerUserIds" | "flowStatus"> | null | undefined;
type ObjectiveWorkItemActor = Pick<OrfUser, "id" | "role"> | null | undefined;

export function taskBelongsToObjective(task: ObjectiveOwnedTask, objectiveId: string) {
  return task.linkedObjectiveId === objectiveId;
}

export function taskIdsForObjective(tasks: ObjectiveOwnedTask[], objectiveId: string) {
  return tasks.filter((task) => taskBelongsToObjective(task, objectiveId)).map((task) => task.id);
}

export function orderObjectiveTasks<T extends ObjectiveOwnedTask>(tasks: T[], objective: ObjectiveTaskOwner) {
  const orderById = new Map(objective.taskIds.map((id, index) => [id, index]));
  return tasks
    .filter((task) => taskBelongsToObjective(task, objective.id))
    .sort((left, right) => {
      const leftIndex = orderById.get(left.id) ?? Number.MAX_SAFE_INTEGER;
      const rightIndex = orderById.get(right.id) ?? Number.MAX_SAFE_INTEGER;
      return leftIndex - rightIndex;
    });
}

export function withObjectiveTaskIds<T extends ObjectiveTaskOwner>(objective: T, tasks: ObjectiveOwnedTask[]) {
  return {
    ...objective,
    taskIds: taskIdsForObjective(tasks, objective.id),
  };
}

export function objectiveWorkItemMutationAccess(
  objective: ObjectiveWorkItemTarget,
  actor: ObjectiveWorkItemActor,
): ObjectiveWorkItemMutationAccess {
  if (!objective) return { status: "blocked", reason: "notFound" };
  if (!canMutateObjectiveWorkItemsByFlow(objective)) return { status: "blocked", reason: "lifecycleLocked" };
  if (actor?.role === "admin") return { status: "allowed" };
  if (actor?.role === "member" && isObjectiveChallenger(objective, actor.id)) return { status: "allowed" };
  return { status: "blocked", reason: "forbidden" };
}

export function canMutateObjectiveWorkItemsForActor(
  objective: ObjectiveWorkItemTarget,
  actor: ObjectiveWorkItemActor,
): boolean {
  return objectiveWorkItemMutationAccess(objective, actor).status === "allowed";
}
