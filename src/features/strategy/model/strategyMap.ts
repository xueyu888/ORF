import type { Objective, Result, Task, TaskStatus, WorkStatus } from "../../../types/orf";

export interface StrategyNode {
  id: string;
  type: string;
  title: string;
  status?: WorkStatus | TaskStatus;
  progress?: number;
  path?: string;
  challenger?: string;
  owner?: string;
}

export interface StrategyLayer {
  id: string;
  nodes: StrategyNode[];
}

export interface StrategyMapModel {
  layers: StrategyLayer[];
  defaultSelected: StrategyNode | null;
}

interface StrategyMapInput {
  objectives: Objective[];
  results: Result[];
  tasks: Task[];
}

export function buildStrategyMap(state: StrategyMapInput, nodeLimit = 5): StrategyMapModel {
  const objectiveById = new Map(state.objectives.map((objective) => [objective.id, objective]));
  const visibleResults = state.results.filter((result) => objectiveById.has(result.objectiveId));
  const visibleTasks = state.tasks.filter((task) => objectiveById.has(task.linkedObjectiveId));

  if (state.objectives.length === 0 && visibleResults.length === 0 && visibleTasks.length === 0) {
    return { layers: [], defaultSelected: null };
  }

  const portfolioLayer: StrategyLayer = {
    id: "portfolio",
    nodes: [
      {
        id: "portfolio-current",
        type: "目标组合",
        title: "当前 ORF 目标组合",
        progress: averageProgress(state.objectives),
      },
    ],
  };
  const cycleLayer: StrategyLayer = {
    id: "cycles",
    nodes: cycleNodes(state.objectives),
  };
  const objectiveLayer: StrategyLayer = {
    id: "objectives",
    nodes: state.objectives.slice(0, nodeLimit).map((objective) => ({
      id: objective.id,
      type: "目标",
      title: objective.title,
      status: objective.status,
      progress: objective.progress,
      path: `/objectives/${objective.id}`,
      challenger: objective.challengers.join("、") || undefined,
    })),
  };
  const resultLayer: StrategyLayer = {
    id: "results",
    nodes: visibleResults.slice(0, nodeLimit).map((result) => {
      const objective = objectiveById.get(result.objectiveId);
      return {
        id: result.id,
        type: "指标",
        title: result.title,
        status: result.status,
        progress: result.confidence,
        challenger: objective?.challengers.join("、") || undefined,
        path: `/objectives/${result.objectiveId}/results/${result.id}`,
      };
    }),
  };
  const taskLayer: StrategyLayer = {
    id: "tasks",
    nodes: visibleTasks.slice(0, nodeLimit).map((task) => ({
      id: task.id,
      type: "行动项",
      title: task.title,
      status: task.status,
      progress: taskProgress(task.status),
      owner: task.assignee,
      path: "/tasks",
    })),
  };
  const layers = [portfolioLayer, cycleLayer, objectiveLayer, resultLayer, taskLayer].filter((layer) => layer.nodes.length > 0);

  return {
    layers,
    defaultSelected: layers[0]?.nodes[0] ?? null,
  };
}

function cycleNodes(objectives: Objective[]): StrategyNode[] {
  const byCycle = new Map<string, Objective[]>();

  for (const objective of objectives) {
    const cycle = objective.cycle.trim() || "未分配周期";
    byCycle.set(cycle, [...(byCycle.get(cycle) ?? []), objective]);
  }

  return [...byCycle.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([cycle, items]) => ({
      id: `cycle-${cycle}`,
      type: "周期",
      title: cycle,
      progress: averageProgress(items),
    }));
}

function averageProgress(objectives: readonly Objective[]) {
  if (objectives.length === 0) {
    return 0;
  }

  return Math.round(objectives.reduce((sum, objective) => sum + objective.progress, 0) / objectives.length);
}

function taskProgress(status: TaskStatus) {
  const progressByStatus: Record<TaskStatus, number> = {
    Backlog: 0,
    Todo: 15,
    "In Progress": 50,
    "In Review": 80,
    Done: 100,
  };

  return progressByStatus[status];
}
