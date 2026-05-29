import type { Objective, ObjectiveFlowStatus } from "../../types/orf";
import { isDateOnlyString } from "../../utils/date";

type ObjectiveDeadlineTarget = Pick<Objective, "finalDueAt" | "flowStatus"> | null | undefined;

const directlyEditableDeadlineStatuses = new Set<ObjectiveFlowStatus>([
  "candidate",
  "open",
  "applying",
  "recruiting",
  "reestimating",
]);

export type ObjectiveDeadlineChangeValidation =
  | { status: "allowed"; mode: "edit" | "extendFrozen" }
  | { status: "invalidDate" }
  | { status: "locked" }
  | { status: "frozenMustExtend" };

export function canEditObjectiveDeadline(target: ObjectiveDeadlineTarget): boolean {
  return Boolean(target && (directlyEditableDeadlineStatuses.has(target.flowStatus) || target.flowStatus === "frozen"));
}

export function validateObjectiveDeadlineChange(
  target: ObjectiveDeadlineTarget,
  nextFinalDueAt: string,
): ObjectiveDeadlineChangeValidation {
  if (!isDateOnlyString(nextFinalDueAt)) {
    return { status: "invalidDate" };
  }

  if (!target || !canEditObjectiveDeadline(target)) {
    return { status: "locked" };
  }

  if (directlyEditableDeadlineStatuses.has(target.flowStatus)) {
    return { status: "allowed", mode: "edit" };
  }

  if (target.flowStatus === "frozen") {
    return nextFinalDueAt > target.finalDueAt
      ? { status: "allowed", mode: "extendFrozen" }
      : { status: "frozenMustExtend" };
  }

  return { status: "locked" };
}

export function minimumObjectiveDeadlineValue(target: ObjectiveDeadlineTarget): string | undefined {
  if (!target || target.flowStatus !== "frozen") return undefined;

  const date = new Date(`${target.finalDueAt}T00:00:00`);
  if (Number.isNaN(date.getTime())) return undefined;

  date.setDate(date.getDate() + 1);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
