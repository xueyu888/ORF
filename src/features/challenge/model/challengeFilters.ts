import {
  isObjectiveAcceptedByFlow,
  isObjectiveReestimatingByFlow,
  isObjectiveSettledOrClosed,
  isObjectiveSubmittedByFlow,
  objectiveChallengeSortRank,
} from "../../../domain/orfLifecycle";
import {
  isObjectiveChallenger,
  objectiveHasChallengers,
} from "../../../domain/orfObjectiveParticipants";
import type { OrfUser } from "../../../types/orf";
import type { ObjectiveNode } from "./types";

export type ChallengeCycleFilter = "all" | string;
export type ChallengeMemberFilter = "all" | string;
export type ChallengeProjectFilter = "all" | "unassigned" | string;
export type ChallengeStatusFilter = "all" | "unassigned" | "pendingReestimate" | "active" | "review" | "revisionRequired" | "accepted" | "settled";
export type ChallengeStatusFilterValue = Exclude<ChallengeStatusFilter, "all">;
export type ChallengeStatusFilterSelection = readonly ChallengeStatusFilterValue[];

export interface ChallengeFilters {
  cycle: ChallengeCycleFilter;
  member: ChallengeMemberFilter;
  project: ChallengeProjectFilter;
  status: ChallengeStatusFilterSelection;
}

export type ChallengeMemberOption = {
  label: string;
  value: ChallengeMemberFilter;
};

export const challengeStatusFilterOptions: Array<{ label: string; value: ChallengeStatusFilter }> = [
  { label: "全部状态", value: "all" },
  { label: "未分配", value: "unassigned" },
  { label: "待重估", value: "pendingReestimate" },
  { label: "执行中", value: "active" },
  { label: "待验收", value: "review" },
  { label: "待返工", value: "revisionRequired" },
  { label: "已验收", value: "accepted" },
  { label: "已结算", value: "settled" },
];
export const challengeStatusFilterValues = challengeStatusFilterOptions
  .map((option) => option.value)
  .filter((value): value is ChallengeStatusFilterValue => value !== "all");
const challengeStatusFilterValueSet = new Set<string>(challengeStatusFilterValues);
const challengeStatusFilterLabelByValue = new Map(challengeStatusFilterOptions.map((option) => [option.value, option.label]));

export function challengeCycleOptions(groups: readonly ObjectiveNode[]) {
  return Array.from(new Set(groups.map((group) => group.objective.cycle.trim()).filter(Boolean))).sort((left, right) => left.localeCompare(right));
}

export function challengeMemberOptions(groups: readonly ObjectiveNode[], users: readonly Pick<OrfUser, "id" | "name">[] = []): ChallengeMemberOption[] {
  const userNameById = new Map(users.map((user) => [user.id, user.name]));
  const membersById = new Map<string, string>();

  for (const group of groups) {
    group.objective.challengerUserIds.forEach((userId, index) => {
      const trimmedUserId = userId.trim();
      if (!trimmedUserId || membersById.has(trimmedUserId)) return;
      membersById.set(trimmedUserId, userNameById.get(trimmedUserId) ?? group.objective.challengers[index]?.trim() ?? trimmedUserId);
    });
  }

  return Array.from(membersById, ([value, label]) => ({ label, value }))
    .sort((left, right) => left.label.localeCompare(right.label, "zh-Hans-CN") || left.value.localeCompare(right.value));
}

export function filterChallengeGroups(groups: readonly ObjectiveNode[], filters: ChallengeFilters): ObjectiveNode[] {
  return groups
    .filter((group) => filters.cycle === "all" || group.objective.cycle === filters.cycle)
    .filter((group) => filters.member === "all" || isObjectiveChallenger(group.objective, filters.member))
    .filter((group) => challengeGroupMatchesProject(group, filters.project))
    .filter((group) => challengeGroupMatchesStatusSelection(group, filters.status));
}

function challengeGroupMatchesProject(group: ObjectiveNode, project: ChallengeProjectFilter): boolean {
  if (project === "all") return true;
  const projectId = group.objective.projectId?.trim() || null;
  return project === "unassigned" ? projectId === null : projectId === project;
}

export function normalizeChallengeStatusFilterSelection(input: unknown): ChallengeStatusFilterSelection {
  const rawValues = Array.isArray(input) ? input : [input];
  const selected: ChallengeStatusFilterValue[] = [];
  const seen = new Set<string>();

  for (const value of rawValues) {
    if (typeof value !== "string" || value === "all" || !challengeStatusFilterValueSet.has(value) || seen.has(value)) continue;
    seen.add(value);
    selected.push(value as ChallengeStatusFilterValue);
  }
  return selected;
}

export function challengeStatusFilterSelectionLabel(selection: ChallengeStatusFilterSelection) {
  if (selection.length === 0) return "全部状态";
  const labels = selection.map((value) => challengeStatusFilterLabelByValue.get(value) ?? value);
  if (labels.length <= 2) return labels.join("、");
  return `${labels[0]}等 ${labels.length} 项`;
}

export function challengeStatusFilterMenuValues(selection: ChallengeStatusFilterSelection): ChallengeStatusFilter[] {
  return selection.length > 0 ? [...selection] : ["all"];
}

function challengeGroupMatchesStatusSelection(group: ObjectiveNode, selection: ChallengeStatusFilterSelection): boolean {
  if (selection.length === 0) return true;
  return selection.some((status) => challengeGroupMatchesStatus(group, status));
}

function challengeGroupMatchesStatus(group: ObjectiveNode, status: ChallengeStatusFilterValue): boolean {
  if (status === "unassigned") return !objectiveHasChallengers(group.objective);
  if (status === "pendingReestimate") return isObjectiveReestimatingByFlow(group.objective);
  if (status === "active") return group.objective.flowStatus === "frozen";
  if (status === "review") return isObjectiveSubmittedByFlow(group.objective);
  if (status === "revisionRequired") return group.objective.flowStatus === "revisionRequired";
  if (status === "accepted") return isObjectiveAcceptedByFlow(group.objective);
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
  return objectiveChallengeSortRank(group.objective, { hasChallengers: objectiveHasChallengers(group.objective) });
}

function compareText(left: string, right: string) {
  return left.localeCompare(right, "zh-Hans-CN");
}

function compareTextDescending(left: string, right: string) {
  return compareText(right, left);
}
