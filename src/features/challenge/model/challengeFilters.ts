import {
  isObjectiveReestimatingByFlow,
  isObjectiveSettledOrClosed,
  isObjectiveSubmittedByFlow,
  objectiveChallengeSortRank,
} from "../../../domain/orfLifecycle";
import type { ObjectiveNode } from "./types";

export type ChallengeCycleFilter = "all" | string;
export type ChallengeMemberFilter = "all" | string;
export type ChallengeStatusFilter = "all" | "unassigned" | "pendingReestimate" | "active" | "review" | "settled";

export interface ChallengeFilters {
  cycle: ChallengeCycleFilter;
  member: ChallengeMemberFilter;
  status: ChallengeStatusFilter;
}

export const challengeStatusFilterOptions: Array<{ label: string; value: ChallengeStatusFilter }> = [
  { label: "全部状态", value: "all" },
  { label: "未分配", value: "unassigned" },
  { label: "待重估", value: "pendingReestimate" },
  { label: "执行中", value: "active" },
  { label: "待验收", value: "review" },
  { label: "已结算", value: "settled" },
];

export function challengeCycleOptions(groups: readonly ObjectiveNode[]) {
  return Array.from(new Set(groups.map((group) => group.objective.cycle.trim()).filter(Boolean))).sort((left, right) => left.localeCompare(right));
}

export function challengeMemberOptions(groups: readonly ObjectiveNode[]) {
  return Array.from(new Set(groups.flatMap((group) => group.challengers.map((member) => member.trim()).filter(Boolean)))).sort((left, right) =>
    left.localeCompare(right, "zh-Hans-CN"),
  );
}

export function filterChallengeGroups(groups: readonly ObjectiveNode[], filters: ChallengeFilters): ObjectiveNode[] {
  return groups
    .filter((group) => filters.cycle === "all" || group.objective.cycle === filters.cycle)
    .filter((group) => filters.member === "all" || group.challengers.includes(filters.member))
    .filter((group) => challengeGroupMatchesStatus(group, filters.status));
}

function challengeGroupMatchesStatus(group: ObjectiveNode, status: ChallengeStatusFilter): boolean {
  if (status === "all") return true;
  if (status === "unassigned") return group.challengers.length === 0;
  if (status === "pendingReestimate") return isObjectiveReestimatingByFlow(group.objective);
  if (status === "active") return group.objective.flowStatus === "frozen";
  if (status === "review") return isObjectiveSubmittedByFlow(group.objective);
  return isObjectiveSettledOrClosed(group.objective);
}

export function sortChallengeGroups(groups: readonly ObjectiveNode[]): ObjectiveNode[] {
  return groups
    .map((group, index) => ({ group, index }))
    .sort((left, right) => compareChallengeGroups(left.group, right.group) || left.index - right.index)
    .map((item) => item.group);
}

function compareChallengeGroups(left: ObjectiveNode, right: ObjectiveNode) {
  return (
    objectiveFlowRank(left) - objectiveFlowRank(right) ||
    compareText(left.deadline, right.deadline) ||
    compareTextDescending(left.objective.createdAt, right.objective.createdAt)
  );
}

function objectiveFlowRank(group: ObjectiveNode) {
  return objectiveChallengeSortRank(group.objective, { hasChallengers: group.challengers.length > 0 });
}

function compareText(left: string, right: string) {
  return left.localeCompare(right, "zh-Hans-CN");
}

function compareTextDescending(left: string, right: string) {
  return compareText(right, left);
}
