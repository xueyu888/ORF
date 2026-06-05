import type { OrfProject } from "../../../types/orf";
import { objectiveComplete } from "./challengeStatus";
import type { ObjectiveNode } from "./types";

export const unassignedObjectiveProjectId = "unassigned-objectives";
export const unassignedObjectiveProjectName = "未归属目标";

export interface ObjectiveProjectGroup {
  id: string;
  name: string;
  projectId: string | null;
  isUnassigned: boolean;
  objectives: ObjectiveNode[];
  objectiveCount: number;
  bountyCount: number;
  actionCount: number;
  activeActionCount: number;
  averageProgress: number;
  blockedCount: number;
  nextDeadline: string;
  reviewCount: number;
  riskCount: number;
  statusLabel: string;
  statusTone: ObjectiveProjectGroupStatusTone;
}

export type ObjectiveProjectGroupStatusTone = "active" | "blocked" | "done" | "idle" | "review" | "warning";
export type ObjectiveProjectOption = Pick<OrfProject, "id" | "name">;

export function objectiveProjectOptions(projects: readonly OrfProject[]): ObjectiveProjectOption[] {
  return projects.map(({ id, name }) => ({ id, name }));
}

export function groupChallengeGroupsByProject(groups: readonly ObjectiveNode[], projects: readonly OrfProject[]): ObjectiveProjectGroup[] {
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const projectGroups = new Map<string, ObjectiveProjectGroup>();

  for (const project of projects) {
    projectGroups.set(project.id, emptyProjectGroup(project.id, project.name, project.id, false));
  }

  for (const group of groups) {
    const projectId = group.objective.projectId?.trim() || null;
    const targetProject = projectId ? projectById.get(projectId) : null;
    const targetId = targetProject ? targetProject.id : unassignedObjectiveProjectId;
    const targetName = targetProject ? targetProject.name : unassignedObjectiveProjectName;
    const existing = projectGroups.get(targetId);
    const projectGroup = existing ?? emptyProjectGroup(targetId, targetName, targetProject?.id ?? null, !targetProject);

    addObjectiveToProjectGroup(projectGroup, group);
    if (!existing) projectGroups.set(targetId, projectGroup);
  }

  return Array.from(projectGroups.values()).map(withProjectSummary);
}

function emptyProjectGroup(id: string, name: string, projectId: string | null, isUnassigned: boolean): ObjectiveProjectGroup {
  return {
    id,
    name,
    projectId,
    isUnassigned,
    objectives: [],
    objectiveCount: 0,
    bountyCount: 0,
    actionCount: 0,
    activeActionCount: 0,
    averageProgress: 0,
    blockedCount: 0,
    nextDeadline: "",
    reviewCount: 0,
    riskCount: 0,
    statusLabel: "等待推进",
    statusTone: "idle",
  };
}

function addObjectiveToProjectGroup(project: ObjectiveProjectGroup, group: ObjectiveNode) {
  project.objectives.push(group);
  project.objectiveCount += 1;
  project.bountyCount += group.bounties.length;
  project.actionCount += group.actions.length;
  project.activeActionCount += group.actions.filter((action) => action.status === "In Progress" || action.status === "In Review").length;
  project.blockedCount += group.objective.status === "Blocked" ? 1 : 0;
  project.riskCount += group.objective.status === "At Risk" || group.objective.status === "Blocked" ? 1 : 0;
  project.reviewCount += group.objective.flowStatus === "submitted" || Boolean(group.objective.lootSubmittedAt) ? 1 : 0;
}

function withProjectSummary(project: ObjectiveProjectGroup): ObjectiveProjectGroup {
  const completeCount = project.objectives.filter((group) => objectiveComplete(group.objective)).length;
  const activeDeadlines = project.objectives
    .filter((group) => !objectiveComplete(group.objective))
    .map(projectObjectiveDeadline)
    .filter(Boolean)
    .sort();
  const fallbackDeadlines = project.objectives.map(projectObjectiveDeadline).filter(Boolean).sort();
  const nextDeadline = activeDeadlines.at(0) ?? fallbackDeadlines.at(0) ?? "";
  const averageProgress = Math.round(average(project.objectives.map((group) => group.objective.progress)));
  const { statusLabel, statusTone } = projectStatusSummary({
    activeActionCount: project.activeActionCount,
    blockedCount: project.blockedCount,
    completeCount,
    isUnassigned: project.isUnassigned,
    objectiveCount: project.objectiveCount,
    reviewCount: project.reviewCount,
    riskCount: project.riskCount,
  });

  return {
    ...project,
    averageProgress,
    nextDeadline,
    statusLabel,
    statusTone,
  };
}

function projectObjectiveDeadline(group: ObjectiveNode) {
  return group.deadline || group.objective.finalDueAt || "";
}

function projectStatusSummary(input: {
  activeActionCount: number;
  blockedCount: number;
  completeCount: number;
  isUnassigned: boolean;
  objectiveCount: number;
  reviewCount: number;
  riskCount: number;
}): Pick<ObjectiveProjectGroup, "statusLabel" | "statusTone"> {
  if (input.objectiveCount === 0) return { statusLabel: input.isUnassigned ? "暂无未归属目标" : "暂无目标", statusTone: "idle" };
  if (input.blockedCount > 0) return { statusLabel: `${input.blockedCount} 个目标阻塞`, statusTone: "blocked" };
  if (input.riskCount > 0) return { statusLabel: `${input.riskCount} 个目标有风险`, statusTone: "warning" };
  if (input.reviewCount > 0) return { statusLabel: `${input.reviewCount} 个目标待验收`, statusTone: "review" };
  if (input.completeCount === input.objectiveCount) return { statusLabel: "目标已完成", statusTone: "done" };
  if (input.activeActionCount > 0) return { statusLabel: `${input.activeActionCount} 个行动项推进中`, statusTone: "active" };
  return { statusLabel: "等待推进", statusTone: "idle" };
}

function average(values: number[]) {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}
