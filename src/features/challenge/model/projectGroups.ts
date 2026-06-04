import type { Objective } from "../../../types/orf";
import type { ObjectiveNode } from "./types";

export const defaultObjectiveProjectId = "default-project";
export const defaultObjectiveProjectName = "默认项目";

export interface ObjectiveProjectGroup {
  id: string;
  name: string;
  objectives: ObjectiveNode[];
  objectiveCount: number;
  bountyCount: number;
  actionCount: number;
}

export function objectiveProjectName(objective: Pick<Objective, "projectId" | "projectName">) {
  const name = objective.projectName?.trim();
  const id = objective.projectId?.trim();
  return name || id || defaultObjectiveProjectName;
}

export function objectiveProjectId(objective: Pick<Objective, "projectId" | "projectName">) {
  const id = objective.projectId?.trim();
  if (id) return id;
  const name = objective.projectName?.trim();
  return name ? `project:${name}` : defaultObjectiveProjectId;
}

export function groupChallengeGroupsByProject(groups: readonly ObjectiveNode[]): ObjectiveProjectGroup[] {
  const projects = new Map<string, ObjectiveProjectGroup>();

  for (const group of groups) {
    const id = objectiveProjectId(group.objective);
    const existing = projects.get(id);
    const project = existing ?? {
      id,
      name: objectiveProjectName(group.objective),
      objectives: [],
      objectiveCount: 0,
      bountyCount: 0,
      actionCount: 0,
    };

    project.objectives.push(group);
    project.objectiveCount += 1;
    project.bountyCount += group.bounties.length;
    project.actionCount += group.actions.length;

    if (!existing) projects.set(id, project);
  }

  return Array.from(projects.values());
}
