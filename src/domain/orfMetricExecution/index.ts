import { canMutateMetricExecutionCompletionByFlow } from "../orfLifecycle";
import { isObjectiveChallenger } from "../orfObjectiveParticipants";
import type { Objective, OrfUser } from "../../types/orf";

export type ObjectiveMetricExecutionCompletionAccess =
  | { status: "allowed" }
  | { status: "blocked"; reason: "notFound" | "lifecycleLocked" | "forbidden" };

type ObjectiveMetricExecutionTarget = Pick<Objective, "challengerUserIds" | "flowStatus"> | null | undefined;
type ObjectiveMetricExecutionActor = Pick<OrfUser, "id" | "role"> | null | undefined;

export function objectiveMetricExecutionCompletionAccess(
  objective: ObjectiveMetricExecutionTarget,
  actor: ObjectiveMetricExecutionActor,
): ObjectiveMetricExecutionCompletionAccess {
  if (!objective) return { status: "blocked", reason: "notFound" };
  if (!canMutateMetricExecutionCompletionByFlow(objective)) return { status: "blocked", reason: "lifecycleLocked" };
  if (actor?.role === "admin") return { status: "allowed" };
  if (actor?.role === "member" && isObjectiveChallenger(objective, actor.id)) return { status: "allowed" };
  return { status: "blocked", reason: "forbidden" };
}

export function canMutateObjectiveMetricExecutionCompletionForActor(
  objective: ObjectiveMetricExecutionTarget,
  actor: ObjectiveMetricExecutionActor,
): boolean {
  return objectiveMetricExecutionCompletionAccess(objective, actor).status === "allowed";
}
