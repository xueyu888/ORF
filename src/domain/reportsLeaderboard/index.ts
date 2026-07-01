import { userDisplayProfileMap } from "../userDisplayProfile";
import type { Objective, ObjectiveAcceptanceReview, OrfState, OrfUser, OrfUserDisplayProfile, PointLedgerEntry } from "../../types/orf";

export type TimeRange = "month" | "quarter" | "year" | "all";

export type LeaderboardObjectiveFact = Pick<Objective, "acceptedResult" | "createdAt" | "flowStatus" | "id" | "updatedAt">;

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

type DateBounds = {
  end: string;
  start: string;
};
type PeriodLeaderboardRow = Omit<LeaderboardRow, "rankChange">;
type ObjectiveCompletionCounts = { completed: number; total: number };
type ObjectiveAcceptanceReviewSummary = {
  hasFailedAcceptance: boolean;
};

function dateOnly(value: string | null | undefined) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;
}

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function ledgerPeriodAt(entry: PointLedgerEntry) {
  return entry.settlementPeriodAt || entry.createdAt;
}

function latestDate(entries: readonly PointLedgerEntry[], objectives: readonly LeaderboardObjectiveFact[]) {
  const ledgerDates = entries.map((entry) => dateOnly(ledgerPeriodAt(entry))).filter((value): value is string => Boolean(value));
  const dates = ledgerDates.length > 0
    ? ledgerDates
    : objectives.map((objective) => dateOnly(objective.updatedAt) ?? dateOnly(objective.createdAt)).filter((value): value is string => Boolean(value));

  return dates.sort().at(-1) ?? new Date().toISOString().slice(0, 10);
}

function rangeBounds(range: TimeRange, anchorDate: string): DateBounds | null {
  if (range === "all") {
    return null;
  }

  const anchor = new Date(`${anchorDate}T00:00:00.000Z`);
  const year = anchor.getUTCFullYear();
  if (range === "month") {
    const month = anchor.getUTCMonth();
    const start = new Date(Date.UTC(year, month, 1));
    const end = new Date(Date.UTC(year, month + 1, 1));
    return {
      start: toDateKey(start),
      end: toDateKey(end),
    };
  }

  if (range === "year") {
    return {
      start: `${year}-01-01`,
      end: `${year + 1}-01-01`,
    };
  }

  const quarterStartMonth = Math.floor(anchor.getUTCMonth() / 3) * 3;
  const start = new Date(Date.UTC(year, quarterStartMonth, 1));
  const end = new Date(Date.UTC(year, quarterStartMonth + 3, 1));
  return {
    start: toDateKey(start),
    end: toDateKey(end),
  };
}

function previousRangeBounds(range: TimeRange, anchorDate: string): DateBounds | null {
  const currentBounds = rangeBounds(range, anchorDate);
  if (!currentBounds) {
    return null;
  }

  const start = new Date(`${currentBounds.start}T00:00:00.000Z`);
  const end = new Date(`${currentBounds.end}T00:00:00.000Z`);
  if (range === "year") {
    start.setUTCFullYear(start.getUTCFullYear() - 1);
    end.setUTCFullYear(end.getUTCFullYear() - 1);
  } else if (range === "month") {
    start.setUTCMonth(start.getUTCMonth() - 1);
    end.setUTCMonth(end.getUTCMonth() - 1);
  } else {
    start.setUTCMonth(start.getUTCMonth() - 3);
    end.setUTCMonth(end.getUTCMonth() - 3);
  }

  return {
    start: toDateKey(start),
    end: toDateKey(end),
  };
}

function isInRange(value: string | null | undefined, range: TimeRange, anchorDate: string) {
  const key = dateOnly(value);
  if (!key) {
    return range === "all";
  }

  const bounds = rangeBounds(range, anchorDate);
  return !bounds || (key >= bounds.start && key < bounds.end);
}

function isInBounds(value: string | null | undefined, bounds: DateBounds) {
  const key = dateOnly(value);
  return Boolean(key && key >= bounds.start && key < bounds.end);
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

export function buildLeaderboardRows(state: LeaderboardState, timeRange: TimeRange): LeaderboardRow[] {
  const anchorDate = latestDate(state.pointLedger, state.objectives);
  const ledger = state.pointLedger.filter((entry) => isInRange(ledgerPeriodAt(entry), timeRange, anchorDate));
  const acceptanceReviewSummary = buildObjectiveAcceptanceReviewSummary(state.objectiveAcceptanceReviews ?? []);
  const currentRows = buildPeriodRows(state.users, state.userProfiles, ledger, state.objectives, acceptanceReviewSummary, 10);
  const previousBounds = previousRangeBounds(timeRange, anchorDate);

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
