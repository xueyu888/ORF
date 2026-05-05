import type { Objective, OrfStage, OrfState, Result, Task } from "../types/orf";

export type CompletionBit = 0 | 1;

export interface AutomaticCompletionSnapshot {
  objective: Objective;
  results: Result[];
  tasks: Task[];
}

export interface AutomaticCompletionResult {
  goal: CompletionBit;
  rets: Record<string, CompletionBit>;
  tasks: Record<string, CompletionBit>;
  legal: boolean;
  errors: string[];
}

export function buildAutomaticCompletionSnapshot(state: OrfState, objectiveId: string): AutomaticCompletionSnapshot | null {
  const objective = state.objectives.find((item) => item.id === objectiveId);
  if (!objective) {
    return null;
  }

  const resultOrder = new Map(objective.resultIds.map((id, index) => [id, index]));
  const results = state.results
    .filter((result) => result.objectiveId === objective.id)
    .sort((left, right) => (resultOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (resultOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER));
  const resultIds = new Set(results.map((result) => result.id));
  const tasks = state.tasks.filter((task) => task.linkedObjectiveId === objective.id || resultIds.has(task.linkedResultId));

  return {
    objective,
    results,
    tasks,
  };
}

export function shouldCallAutomaticCompletion({
  previousStage,
  currentStage,
  snapshotChanged,
}: {
  previousStage: OrfStage | undefined;
  currentStage: OrfStage;
  snapshotChanged: boolean;
}): boolean {
  if (previousStage !== "goalFrozen" && currentStage === "goalFrozen") {
    return true;
  }

  return currentStage === "goalFrozen" && snapshotChanged;
}

export function calculateAutomaticCompletion(snapshot: AutomaticCompletionSnapshot): AutomaticCompletionResult {
  const tasks: Record<string, CompletionBit> = {};
  const rets: Record<string, CompletionBit> = {};
  const errors: string[] = [];
  const resultIds = new Set(snapshot.results.map((result) => result.id));

  if (snapshot.results.length === 0) {
    errors.push(`goal ${snapshot.objective.id} must contain at least one ret`);
  }

  for (const task of snapshot.tasks) {
    if (!resultIds.has(task.linkedResultId)) {
      continue;
    }

    if (task.linkedObjectiveId !== snapshot.objective.id) {
      errors.push(`task ${task.id} linkedObjectiveId must equal goal ${snapshot.objective.id}`);
    }

    tasks[task.id] = calculateTaskCompletion(task);
  }

  for (const result of snapshot.results) {
    const resultTasks = snapshot.tasks.filter((task) => task.linkedResultId === result.id);

    if (resultTasks.length === 0) {
      errors.push(`ret ${result.id} must contain at least one task`);
      rets[result.id] = 0;
      continue;
    }

    rets[result.id] = allDone(resultTasks.map((task) => tasks[task.id] ?? 0));
  }

  const legal = errors.length === 0;
  const goal = legal ? allDone(snapshot.results.map((result) => rets[result.id] ?? 0)) : 0;

  return {
    goal,
    rets,
    tasks,
    legal,
    errors,
  };
}

function calculateTaskCompletion(task: Task): CompletionBit {
  if (task.checklist.length === 0) {
    return task.status === "Done" ? 1 : 0;
  }

  return allDone(task.checklist.map((item) => (item.done ? 1 : 0)));
}

function allDone(values: CompletionBit[]): CompletionBit {
  return values.length > 0 && values.every((value) => value === 1) ? 1 : 0;
}
