import type { ObjectiveFlowStatus } from "../../types/orf";

export const REESTIMATE_WINDOW_HALF_DAY_MS = 12 * 60 * 60 * 1000;
export const REESTIMATE_WINDOW_MAX_HALF_DAYS = 18;
export const REESTIMATE_WINDOW_RATIO = 0.3;

export type ObjectiveReestimateWindowTarget = {
  acceptedAt?: string | null;
  finalDueAt?: string | null;
  flowStatus: ObjectiveFlowStatus;
};

export type ObjectiveReestimateWindowSync =
  | { status: "unchanged" }
  | { status: "updated"; confirmationDueAt: string }
  | { status: "invalid" };

export function calculateObjectiveReestimateDueAt(
  finalDueAt: string | null | undefined,
  acceptedAt: string | null | undefined,
): string | null {
  if (!finalDueAt || !acceptedAt) return null;

  const finalDueDate = new Date(`${finalDueAt}T23:59:00`);
  const acceptedDate = new Date(acceptedAt);
  if (Number.isNaN(finalDueDate.getTime()) || Number.isNaN(acceptedDate.getTime())) return null;

  const remainingMs = finalDueDate.getTime() - acceptedDate.getTime();
  if (remainingMs < REESTIMATE_WINDOW_HALF_DAY_MS) return null;

  const roundedHalfDays = Math.round((remainingMs * REESTIMATE_WINDOW_RATIO) / REESTIMATE_WINDOW_HALF_DAY_MS);
  const confirmationHalves = Math.min(REESTIMATE_WINDOW_MAX_HALF_DAYS, Math.max(1, roundedHalfDays));
  return new Date(acceptedDate.getTime() + confirmationHalves * REESTIMATE_WINDOW_HALF_DAY_MS).toISOString();
}

export function resolveObjectiveReestimateWindowSync(
  target: ObjectiveReestimateWindowTarget | null | undefined,
  nextFinalDueAt: string,
): ObjectiveReestimateWindowSync {
  if (!target || target.flowStatus !== "reestimating" || target.finalDueAt === nextFinalDueAt) {
    return { status: "unchanged" };
  }

  const confirmationDueAt = calculateObjectiveReestimateDueAt(nextFinalDueAt, target.acceptedAt);
  return confirmationDueAt ? { status: "updated", confirmationDueAt } : { status: "invalid" };
}
