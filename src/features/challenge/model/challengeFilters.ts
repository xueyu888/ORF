import type { ObjectiveNode, BountyStatus } from "./types";

export type ChallengeCycleFilter = "all" | string;
export type ChallengeStatusFilter = "all" | "unassigned" | BountyStatus;

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

      if (filters.status === "unassigned") {
        return group.challengers.length === 0 ? group : null;
      }

      return {
        ...group,
        bounties: group.bounties.filter((bounty) => bounty.status === filters.status),
      };
    })
    .filter((group): group is ObjectiveNode => {
      if (!group) return false;
      return filters.status === "all" || filters.status === "unassigned" || group.bounties.length > 0;
    });
}

export function sortChallengeGroups(groups: readonly ObjectiveNode[]): ObjectiveNode[] {
  return [...groups].sort(compareChallengeGroups);
}

function compareChallengeGroups(left: ObjectiveNode, right: ObjectiveNode) {
  return (
    objectiveFlowRank(left) - objectiveFlowRank(right) ||
    compareText(left.deadline, right.deadline) ||
    compareTextDescending(left.objective.createdAt, right.objective.createdAt) ||
    compareText(left.objective.title, right.objective.title) ||
    compareText(left.objective.id, right.objective.id)
  );
}

function objectiveFlowRank(group: ObjectiveNode) {
  switch (group.objective.flowStatus) {
    case "candidate":
      return 0;
    case "open":
    case "applying":
    case "recruiting":
      return group.challengers.length === 0 ? 1 : 2;
    case "reestimating":
    case "frozen":
      return 3;
    case "submitted":
      return 4;
    case "settled":
      return 5;
    case "closed":
      return 6;
    default:
      return 7;
  }
}

function compareText(left: string, right: string) {
  return left.localeCompare(right, "zh-Hans-CN");
}

function compareTextDescending(left: string, right: string) {
  return compareText(right, left);
}
