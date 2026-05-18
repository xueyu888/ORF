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

function dateOnly(value: string | null | undefined) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;
}

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function latestDate(entries: PointLedgerEntry[], objectives: Objective[]) {
  const dates = [
    ...entries.map((entry) => dateOnly(entry.createdAt)),
    ...objectives.map((objective) => dateOnly(objective.updatedAt) ?? dateOnly(objective.createdAt)),
  ].filter((value): value is string => Boolean(value));

  return dates.sort().at(-1) ?? new Date().toISOString().slice(0, 10);
}

function rangeBounds(range: TimeRange, anchorDate: string) {
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

function isInRange(value: string | null | undefined, range: TimeRange, anchorDate: string) {
  const key = dateOnly(value);
  if (!key) {
    return range === "all";
  }

  const bounds = rangeBounds(range, anchorDate);
  return !bounds || (key >= bounds.start && key < bounds.end);
}

function memberNames(users: OrfUser[], pointsByMember: Map<string, number>, objectiveCounts: Map<string, { completed: number; total: number }>) {
  return Array.from(new Set([...users.map((user) => user.name), ...pointsByMember.keys(), ...objectiveCounts.keys()])).filter(Boolean);
}

export function buildLeaderboardRows(state: LeaderboardState, timeRange: TimeRange): LeaderboardRow[] {
  const anchorDate = latestDate(state.pointLedger, state.objectives);
  const ledger = state.pointLedger.filter((entry) => isInRange(entry.createdAt, timeRange, anchorDate));
  const objectives = state.objectives.filter((objective) => isInRange(objective.updatedAt ?? objective.createdAt, timeRange, anchorDate));

  const pointsByMember = new Map<string, number>();
  for (const entry of ledger) {
    pointsByMember.set(entry.memberName, (pointsByMember.get(entry.memberName) ?? 0) + entry.points);
  }

  const objectiveCounts = new Map<string, { completed: number; total: number }>();
  for (const objective of objectives) {
    for (const challenger of objective.challengers) {
      const current = objectiveCounts.get(challenger) ?? { completed: 0, total: 0 };
      current.total += 1;
      if (objective.flowStatus === "settled" && objective.acceptedResult !== "abandoned") {
        current.completed += 1;
      }
      objectiveCounts.set(challenger, current);
    }
  }

  return memberNames(state.users, pointsByMember, objectiveCounts)
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
    .filter((row) => row.points > 0 || row.completionRate > 0)
    .sort((left, right) => right.points - left.points || right.completionRate - left.completionRate || left.memberName.localeCompare(right.memberName))
    .slice(0, 10)
    .map((row, index) => ({
      ...row,
      rank: index + 1,
    }));
}
