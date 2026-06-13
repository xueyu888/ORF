import type { Objective, OrfState, PointLedgerEntry, OrfUser } from "../../../types/orf";

export type TimeRange = "quarter" | "year" | "all";

export type LeaderboardRow = {
  completionRate: number;
  memberName: string;
  points: number;
  rank: number;
  rankChange: number;
};

type LeaderboardState = Pick<OrfState, "objectives" | "pointLedger" | "users">;
type DateBounds = {
  end: string;
  start: string;
};

function dateOnly(value: string | null | undefined) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;
}

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function latestDate(entries: PointLedgerEntry[], objectives: Objective[]) {
  const ledgerDates = entries.map((entry) => dateOnly(entry.createdAt)).filter((value): value is string => Boolean(value));
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

function memberNames(users: OrfUser[], pointsByMember: Map<string, number>, objectiveCounts: Map<string, { completed: number; total: number }>) {
  return Array.from(new Set([...users.map((user) => user.name), ...pointsByMember.keys(), ...objectiveCounts.keys()])).filter(Boolean);
}

function buildPeriodRows(users: OrfUser[], ledger: PointLedgerEntry[], objectives: Objective[]) {
  const pointsByMember = new Map<string, number>();
  for (const entry of ledger) {
    pointsByMember.set(entry.memberName, (pointsByMember.get(entry.memberName) ?? 0) + entry.points);
  }

  const objectiveById = new Map(objectives.map((objective) => [objective.id, objective]));
  const objectiveCounts = new Map<string, { completed: number; total: number }>();
  const seenParticipation = new Set<string>();
  for (const entry of ledger) {
    const objective = objectiveById.get(entry.objectiveId);
    if (!objective) continue;
    const key = `${entry.memberName}\u0000${entry.objectiveId}`;
    if (seenParticipation.has(key)) continue;
    seenParticipation.add(key);

    const current = objectiveCounts.get(entry.memberName) ?? { completed: 0, total: 0 };
    current.total += 1;
    if (objective.flowStatus === "settled" && objective.acceptedResult !== "abandoned") {
      current.completed += 1;
    }
    objectiveCounts.set(entry.memberName, current);
  }

  return memberNames(users, pointsByMember, objectiveCounts)
    .map((memberName) => {
      const counts = objectiveCounts.get(memberName) ?? { completed: 0, total: 0 };
      const points = pointsByMember.get(memberName) ?? 0;
      return {
        completionRate: counts.total > 0 ? Math.round((counts.completed / counts.total) * 100) : 0,
        memberName,
        points,
        rankChange: 0,
      };
    })
    .filter((row) => row.points > 0 || row.completionRate > 0 || (objectiveCounts.get(row.memberName)?.total ?? 0) > 0)
    .sort((left, right) => right.points - left.points || right.completionRate - left.completionRate || left.memberName.localeCompare(right.memberName))
    .slice(0, 10)
    .map((row, index) => ({
      ...row,
      rank: index + 1,
    }));
}

export function buildLeaderboardRows(state: LeaderboardState, timeRange: TimeRange): LeaderboardRow[] {
  const anchorDate = latestDate(state.pointLedger, state.objectives);
  const ledger = state.pointLedger.filter((entry) => isInRange(entry.createdAt, timeRange, anchorDate));
  const objectives = state.objectives.filter((objective) => isInRange(objective.updatedAt ?? objective.createdAt, timeRange, anchorDate));
  const currentRows = buildPeriodRows(state.users, ledger, objectives);
  const previousBounds = previousRangeBounds(timeRange, anchorDate);

  if (!previousBounds) {
    return currentRows;
  }

  const previousRows = buildPeriodRows(
    state.users,
    state.pointLedger.filter((entry) => isInBounds(entry.createdAt, previousBounds)),
    state.objectives.filter((objective) => isInBounds(objective.updatedAt ?? objective.createdAt, previousBounds)),
  );
  const previousRanks = new Map(previousRows.map((row) => [row.memberName, row.rank]));

  return currentRows.map((row) => {
    const previousRank = previousRanks.get(row.memberName);
    return {
      ...row,
      rankChange: previousRank ? previousRank - row.rank : 0,
    };
  });
}
