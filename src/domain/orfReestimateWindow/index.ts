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

export type FrozenReestimateReopenBlockReason =
  | "lifecycleLocked"
  | "missingReestimateDueAt"
  | "invalidReestimateDueAt"
  | "reestimateDueAtNotFuture"
  | "finalDueAtElapsed"
  | "reestimateDueAtAfterFinalDueAt";

export type FrozenReestimateReopenTarget = {
  finalDueAt?: string | null;
  flowStatus: ObjectiveFlowStatus;
};

export type FrozenReestimateReopenValidation =
  | { status: "allowed"; confirmationDueAt: string }
  | { status: "blocked"; reason: FrozenReestimateReopenBlockReason };

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

export function objectiveFinalDueAtCutoff(finalDueAt: string | null | undefined): Date | null {
  if (!finalDueAt) return null;
  const finalDueDate = new Date(`${finalDueAt}T23:59:00`);
  return Number.isNaN(finalDueDate.getTime()) ? null : finalDueDate;
}

export function validateFrozenReestimateReopenDueAt(
  target: FrozenReestimateReopenTarget | null | undefined,
  confirmationDueAt: string | null | undefined,
  now = new Date(),
): FrozenReestimateReopenValidation {
  if (!target || target.flowStatus !== "frozen") {
    return { status: "blocked", reason: "lifecycleLocked" };
  }

  const finalDueAtCutoff = objectiveFinalDueAtCutoff(target.finalDueAt);
  if (!finalDueAtCutoff) {
    return { status: "blocked", reason: "invalidReestimateDueAt" };
  }

  if (finalDueAtCutoff.getTime() <= now.getTime()) {
    return { status: "blocked", reason: "finalDueAtElapsed" };
  }

  if (!confirmationDueAt) {
    return { status: "blocked", reason: "missingReestimateDueAt" };
  }

  const dueAt = new Date(confirmationDueAt);
  if (Number.isNaN(dueAt.getTime())) {
    return { status: "blocked", reason: "invalidReestimateDueAt" };
  }

  if (dueAt.getTime() <= now.getTime()) {
    return { status: "blocked", reason: "reestimateDueAtNotFuture" };
  }

  if (dueAt.getTime() > finalDueAtCutoff.getTime()) {
    return { status: "blocked", reason: "reestimateDueAtAfterFinalDueAt" };
  }

  return { status: "allowed", confirmationDueAt: dueAt.toISOString() };
}
