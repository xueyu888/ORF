import { isDateOnlyString, localDateString } from "../utils/date";

/** Inclusive civil dates; never inferred from acceptance or settlement timestamps. */
export interface AchievementPeriod { start: string; end: string }

export function isAchievementPeriod(value: unknown): value is AchievementPeriod {
  if (!value || typeof value !== "object") return false;
  const { start, end } = value as Partial<AchievementPeriod>;
  return typeof start === "string" && typeof end === "string" && isDateOnlyString(start) && isDateOnlyString(end) && start <= end;
}

export function periodFromColumns(start: string | null | undefined, end: string | null | undefined): AchievementPeriod | null {
  const period = { start, end };
  return isAchievementPeriod(period) ? period : null;
}

/** A form suggestion only. The administrator must submit the explicit interval. */
export function suggestedAchievementPeriod(cycle: string): AchievementPeriod | null {
  const month = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(cycle);
  const quarter = /^(\d{4}) Q([1-4])$/.exec(cycle);
  if (!month && !quarter) return null;
  const year = Number((month ?? quarter)![1]);
  const firstMonth = month ? Number(month[2]) - 1 : (Number(quarter![2]) - 1) * 3;
  const result = { start: localDateString(new Date(year, firstMonth, 1)), end: localDateString(new Date(year, firstMonth + (month ? 1 : 3), 0)) };
  return isAchievementPeriod(result) ? result : null;
}

export function achievementPeriodRelation(period: AchievementPeriod | null | undefined, range: AchievementPeriod | null): "included" | "crossing" | "outside" | "unassigned" {
  if (!isAchievementPeriod(period)) return "unassigned";
  if (!range || (period.start >= range.start && period.end <= range.end)) return "included";
  return period.start <= range.end && period.end >= range.start ? "crossing" : "outside";
}
