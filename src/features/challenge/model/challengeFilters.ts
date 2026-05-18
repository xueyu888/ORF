import type { ObjectiveNode, BountyStatus } from "./types";

export type ChallengeCycleFilter = "all" | string;
export type ChallengeStatusFilter = "all" | BountyStatus;

export interface ChallengeFilters {
  cycle: ChallengeCycleFilter;
  status: ChallengeStatusFilter;
}

export function challengeCycleOptions(groups: readonly ObjectiveNode[]) {
  return Array.from(new Set(groups.map((group) => group.objective.cycle.trim()).filter(Boolean))).sort((left, right) => left.localeCompare(right));
}

export function filterChallengeGroups(groups: readonly ObjectiveNode[], filters: ChallengeFilters): ObjectiveNode[] {
  return groups
    .filter((group) => filters.cycle === "all" || group.objective.cycle === filters.cycle)
    .map((group) => {
      if (filters.status === "all") {
        return group;
      }

      return {
        ...group,
        bounties: group.bounties.filter((bounty) => bounty.status === filters.status),
      };
    })
    .filter((group) => filters.status === "all" || group.bounties.length > 0);
}
