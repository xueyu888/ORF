import type { Objective, Result } from "../../types/orf";
import { canFreezeObjectiveByFlow } from "./guards";

export type ObjectiveFreezeBlockReason =
  | "notFound"
  | "lifecycleLocked"
  | "missingResults";

export type ObjectiveFreezeReadiness =
  | { status: "ready" }
  | { status: "blocked"; reason: ObjectiveFreezeBlockReason };

type ObjectiveFreezeTarget = Pick<Objective, "id" | "flowStatus"> | null | undefined;
type ObjectiveFreezeResult = Pick<Result, "objectiveId">;

export function objectiveFreezeReadinessAfterReestimate(
  objective: ObjectiveFreezeTarget,
  results: readonly ObjectiveFreezeResult[],
): ObjectiveFreezeReadiness {
  if (!objective) return { status: "blocked", reason: "notFound" };
  if (!canFreezeObjectiveByFlow(objective)) return { status: "blocked", reason: "lifecycleLocked" };

  const objectiveResults = results.filter((result) => result.objectiveId === objective.id);
  if (objectiveResults.length === 0) return { status: "blocked", reason: "missingResults" };

  return { status: "ready" };
}

export function canFreezeObjectiveAfterReestimate(
  objective: ObjectiveFreezeTarget,
  results: readonly ObjectiveFreezeResult[],
): boolean {
  return objectiveFreezeReadinessAfterReestimate(objective, results).status === "ready";
}
