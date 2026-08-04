import { userDisplayProfileMap } from "../userDisplayProfile";
import type { Objective, ObjectiveAcceptanceReview, OrfState, OrfUser, OrfUserDisplayProfile, PointLedgerEntry } from "../../types/orf";
import { addCalendarDays, isDateOnlyString, localDateString } from "../../utils/date";

export type TimeRange = "month" | "quarter" | "year" | "custom" | "all";

export type LeaderboardObjectiveFact = Pick<Objective, "acceptedResult" | "createdAt" | "flowStatus" | "id" | "updatedAt"> & {
  title?: string;
};

export type LeaderboardAcceptanceReviewFact = Pick<ObjectiveAcceptanceReview, "acceptedResult" | "objectiveId">;

export type ReportsPageData = {
  objectives: LeaderboardObjectiveFact[];
  objectiveAcceptanceReviews: LeaderboardAcceptanceReviewFact[];
  pointLedger: PointLedgerEntry[];
  userProfiles: OrfUserDisplayProfile[];
};

export type LeaderboardState = Pick<OrfState, "pointLedger"> & {
  objectiveAcceptanceReviews?: readonly LeaderboardAcceptanceReviewFact[];
  objectives: readonly LeaderboardObjectiveFact[];
  userProfiles?: readonly OrfUserDisplayProfile[];
  users?: readonly OrfUser[];
};

export type LeaderboardRankChange =
  | { kind: "unavailable" }
  | { kind: "new" }
  | { kind: "flat"; previousRank: number }
  | { kind: "moved"; delta: number; direction: "down" | "up"; previousRank: number };

export type LeaderboardRow = {
  avatarUrl?: string | null;
  completionRate: number;
  memberName: string;
  points: number;
  rank: number;
  rankChange: LeaderboardRankChange;
  userId: string;
};

export type LeaderboardRangeBounds = {
  end: string;
  endExclusive: string;
  start: string;
};

export type LeaderboardDateRange = Pick<LeaderboardRangeBounds, "end" | "start">;

export type LeaderboardRangeSelection = {
  customRange?: LeaderboardDateRange;
  endDate?: string;
};

export type SettlementDaySummary = {
  count: number;
  date: string;
  points: number;
};

type PeriodLeaderboardRow = Omit<LeaderboardRow, "rankChange">;
type RollingTimeRange = Exclude<TimeRange, "all" | "custom">;
type ObjectiveCompletionCounts = { completed: number; total: number };
type ObjectiveAcceptanceReviewSummary = {
  hasFailedAcceptance: boolean;
};

const windowMonthsByRange: Record<RollingTimeRange, number> = {
  month: 1,
  quarter: 3,
  year: 12,
};

function dateOnly(value: string | null | undefined) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;
}

function todayDateKey() {
  return localDateString(new Date());
}

function ledgerPeriodAt(entry: PointLedgerEntry) {
  return entry.settlementPeriodAt || entry.createdAt;
}

function normalizeDateKey(value: string | undefined, fallback = todayDateKey()) {
  return value && isDateOnlyString(value) ? value : fallback;
}

function dateParts(value: string) {
  return {
    day: Number(value.slice(8, 10)),
    monthIndex: Number(value.slice(5, 7)) - 1,
    year: Number(value.slice(0, 4)),
  };
}

function calendarMonthLength(year: number, monthIndex: number) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

export function addCalendarMonths(value: string, amount: number) {
  const safeValue = normalizeDateKey(value);
  const { day, monthIndex, year } = dateParts(safeValue);
  const targetMonth = new Date(year, monthIndex + amount, 1);
  const targetYear = targetMonth.getFullYear();
  const targetMonthIndex = targetMonth.getMonth();
  const targetDay = Math.min(day, calendarMonthLength(targetYear, targetMonthIndex));
  return localDateString(new Date(targetYear, targetMonthIndex, targetDay));
}

export function shiftLeaderboardEndDate(endDate: string, range: TimeRange, amount: number) {
  if (!isRollingRange(range)) {
    return normalizeDateKey(endDate);
  }
  return addCalendarMonths(endDate, windowMonthsByRange[range] * amount);
}

function isRollingRange(range: TimeRange): range is RollingTimeRange {
  return range !== "all" && range !== "custom";
}

function normalizeLeaderboardRangeSelection(selection: LeaderboardRangeSelection | string | undefined): LeaderboardRangeSelection {
  return typeof selection === "string" ? { endDate: selection } : selection ?? {};
}

function normalizeDateRange(range: LeaderboardDateRange | undefined, fallbackEndDate: string): LeaderboardDateRange {
  const safeEnd = normalizeDateKey(range?.end, fallbackEndDate);
  const safeStart = normalizeDateKey(range?.start, safeEnd);
  return safeStart <= safeEnd
    ? { end: safeEnd, start: safeStart }
    : { end: safeStart, start: safeEnd };
}

export function buildLeaderboardRangeBounds(range: TimeRange, selection: LeaderboardRangeSelection | string = todayDateKey()): LeaderboardRangeBounds | null {
  if (range === "all") {
    return null;
  }

  const normalizedSelection = normalizeLeaderboardRangeSelection(selection);
  const safeEndDate = normalizeDateKey(normalizedSelection.endDate);
  if (range === "custom") {
    const customRange = normalizeDateRange(normalizedSelection.customRange, safeEndDate);
    return {
      end: customRange.end,
      endExclusive: addCalendarDays(customRange.end, 1, customRange.end),
      start: customRange.start,
    };
  }

  return {
    end: safeEndDate,
    endExclusive: addCalendarDays(safeEndDate, 1, safeEndDate),
    start: addCalendarMonths(safeEndDate, -windowMonthsByRange[range]),
  };
}

function previousRangeBounds(range: TimeRange, selection: LeaderboardRangeSelection | string): LeaderboardRangeBounds | null {
  if (!isRollingRange(range)) {
    return null;
  }

  const { endDate } = normalizeLeaderboardRangeSelection(selection);
  const safeEndDate = normalizeDateKey(endDate);
  return buildLeaderboardRangeBounds(range, shiftLeaderboardEndDate(safeEndDate, range, -1));
}

function isInRange(value: string | null | undefined, range: TimeRange, selection: LeaderboardRangeSelection | string) {
  const key = dateOnly(value);
  if (!key) {
    return range === "all";
  }

  const bounds = buildLeaderboardRangeBounds(range, selection);
  return !bounds || (key >= bounds.start && key < bounds.endExclusive);
}

function isInBounds(value: string | null | undefined, bounds: LeaderboardRangeBounds) {
  const key = dateOnly(value);
  return Boolean(key && key >= bounds.start && key < bounds.endExclusive);
}

function userIds(
  users: readonly OrfUser[] | undefined,
  profiles: Map<string, OrfUserDisplayProfile>,
  pointsByUserId: Map<string, number>,
  objectiveCounts: Map<string, ObjectiveCompletionCounts>,
) {
  return Array.from(new Set([...profiles.keys(), ...(users ?? []).map((user) => user.id), ...pointsByUserId.keys(), ...objectiveCounts.keys()])).filter(Boolean);
}

function buildObjectiveAcceptanceReviewSummary(reviews: readonly LeaderboardAcceptanceReviewFact[]) {
  const summaryByObjectiveId = new Map<string, ObjectiveAcceptanceReviewSummary>();
  for (const review of reviews) {
    const current = summaryByObjectiveId.get(review.objectiveId) ?? { hasFailedAcceptance: false };
    if (review.acceptedResult === "abandoned") {
      current.hasFailedAcceptance = true;
    }
    summaryByObjectiveId.set(review.objectiveId, current);
  }
  return summaryByObjectiveId;
}

function isObjectiveCreditedAsCompleted(
  objective: LeaderboardObjectiveFact,
  acceptanceReviewSummary: Map<string, ObjectiveAcceptanceReviewSummary>,
) {
  const reviewSummary = acceptanceReviewSummary.get(objective.id);
  return objective.flowStatus === "settled" && objective.acceptedResult !== "abandoned" && !reviewSummary?.hasFailedAcceptance;
}

function buildPeriodRows(
  users: readonly OrfUser[] | undefined,
  userProfiles: readonly OrfUserDisplayProfile[] | undefined,
  ledger: readonly PointLedgerEntry[],
  objectives: readonly LeaderboardObjectiveFact[],
  acceptanceReviewSummary: Map<string, ObjectiveAcceptanceReviewSummary>,
  limit?: number,
): PeriodLeaderboardRow[] {
  const displayProfiles = userDisplayProfileMap({ userProfiles, users });
  const ledgerNameByUserId = new Map<string, string>();
  const pointsByUserId = new Map<string, number>();
  for (const entry of ledger) {
    if (!entry.userId) continue;
    if (entry.memberName.trim() && !ledgerNameByUserId.has(entry.userId)) {
      ledgerNameByUserId.set(entry.userId, entry.memberName.trim());
    }
    pointsByUserId.set(entry.userId, (pointsByUserId.get(entry.userId) ?? 0) + entry.points);
  }

  const objectiveById = new Map(objectives.map((objective) => [objective.id, objective]));
  const objectiveCounts = new Map<string, ObjectiveCompletionCounts>();
  const seenParticipation = new Set<string>();
  for (const entry of ledger) {
    if (!entry.userId) continue;
    const objective = objectiveById.get(entry.objectiveId);
    if (!objective) continue;
    const key = `${entry.userId}\u0000${entry.objectiveId}`;
    if (seenParticipation.has(key)) continue;
    seenParticipation.add(key);

    const current = objectiveCounts.get(entry.userId) ?? { completed: 0, total: 0 };
    current.total += 1;
    if (isObjectiveCreditedAsCompleted(objective, acceptanceReviewSummary)) {
      current.completed += 1;
    }
    objectiveCounts.set(entry.userId, current);
  }

  const rows = userIds(users, displayProfiles, pointsByUserId, objectiveCounts)
    .map((userId) => {
      const counts = objectiveCounts.get(userId) ?? { completed: 0, total: 0 };
      const points = pointsByUserId.get(userId) ?? 0;
      const displayProfile = displayProfiles.get(userId);
      return {
        avatarUrl: displayProfile?.avatarUrl ?? null,
        completionRate: counts.total > 0 ? Math.round((counts.completed / counts.total) * 100) : 0,
        memberName: displayProfile?.name ?? ledgerNameByUserId.get(userId) ?? userId,
        points,
        userId,
      };
    })
    .filter((row) => row.points > 0 || row.completionRate > 0 || (objectiveCounts.get(row.userId)?.total ?? 0) > 0)
    .sort((left, right) => right.points - left.points || right.completionRate - left.completionRate || left.memberName.localeCompare(right.memberName))
    .map((row, index) => ({
      ...row,
      rank: index + 1,
    }));

  return typeof limit === "number" ? rows.slice(0, limit) : rows;
}

function rankChangeFor(row: PeriodLeaderboardRow, previousRanks: Map<string, number>): LeaderboardRankChange {
  const previousRank = previousRanks.get(row.userId);
  if (!previousRank) {
    return { kind: "new" };
  }

  const delta = previousRank - row.rank;
  if (delta === 0) {
    return { kind: "flat", previousRank };
  }

  return {
    delta: Math.abs(delta),
    direction: delta > 0 ? "up" : "down",
    kind: "moved",
    previousRank,
  };
}

export function buildSettlementDaySummaries(entries: readonly PointLedgerEntry[]): SettlementDaySummary[] {
  const summariesByDate = new Map<string, SettlementDaySummary>();
  for (const entry of entries) {
    const date = dateOnly(ledgerPeriodAt(entry));
    if (!date) continue;

    const current = summariesByDate.get(date) ?? { count: 0, date, points: 0 };
    current.count += 1;
    current.points += entry.points;
    summariesByDate.set(date, current);
  }

  return Array.from(summariesByDate.values()).sort((left, right) => left.date.localeCompare(right.date));
}

export function buildLeaderboardRows(state: LeaderboardState, timeRange: TimeRange, selection: LeaderboardRangeSelection | string = todayDateKey()): LeaderboardRow[] {
  const normalizedSelection = normalizeLeaderboardRangeSelection(selection);
  const effectiveSelection = typeof selection === "string" ? selection : normalizedSelection;
  const ledger = state.pointLedger.filter((entry) => isInRange(ledgerPeriodAt(entry), timeRange, effectiveSelection));
  const acceptanceReviewSummary = buildObjectiveAcceptanceReviewSummary(state.objectiveAcceptanceReviews ?? []);
  const currentRows = buildPeriodRows(state.users, state.userProfiles, ledger, state.objectives, acceptanceReviewSummary, 10);
  const previousBounds = previousRangeBounds(timeRange, effectiveSelection);

  if (!previousBounds) {
    return currentRows.map((row) => ({
      ...row,
      rankChange: { kind: "unavailable" },
    }));
  }

  const previousRows = buildPeriodRows(
    state.users,
    state.userProfiles,
    state.pointLedger.filter((entry) => isInBounds(ledgerPeriodAt(entry), previousBounds)),
    state.objectives,
    acceptanceReviewSummary,
  );
  const previousRanks = new Map(previousRows.map((row) => [row.userId, row.rank]));

  return currentRows.map((row) => ({
    ...row,
    rankChange: rankChangeFor(row, previousRanks),
  }));
}
