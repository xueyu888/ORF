import type { Evidence, Feedback, Objective, Result, Task } from "../../../types/orf";
import { resultProgress } from "../../../utils/format";
import { addDays, bountyUpdatedAt, latestDate } from "./challengeDates";
import { bountyDifficulty, bountyStatus } from "./challengeStatus";
import type { BountyNode, ObjectiveNode } from "./types";

export function buildChallengeTree(
  input: {
    evidence: Evidence[];
    feedback: Feedback[];
    objectives: Objective[];
    results: Result[];
    tasks: Task[];
  },
  allowedObjectiveIds?: Set<string>,
): ObjectiveNode[] {
  return input.objectives
    .filter((objective) => !allowedObjectiveIds || allowedObjectiveIds.has(objective.id))
    .map((objective) => {
      const orderedResults = input.results
        .filter((result) => result.objectiveId === objective.id)
        .sort((left, right) => orderIndex(objective.resultIds, left.id) - orderIndex(objective.resultIds, right.id));
      const bounties = orderedResults.map((result) => ({
        result,
        status: bountyStatus(result, objective),
        deadline: objective.finalDueAt,
        updatedAt: bountyUpdatedAt(result, input.feedback, input.evidence),
        progress: resultProgress(result),
        difficulty: bountyDifficulty(result),
      }) satisfies BountyNode);
      const actions = input.tasks
        .filter((task) => task.linkedObjectiveId === objective.id)
        .sort((left, right) => orderIndex(objective.taskIds, left.id) - orderIndex(objective.taskIds, right.id));

      return {
        objective,
        actions,
        bounties,
        challengers: objective.challengers,
        deadline: objective.finalDueAt || latestDate([...bounties.map((bounty) => bounty.deadline), ...actions.map((action) => action.dueDate)]) || addDays(objective.updatedAt, 7),
      };
    });
}

export function summarizeDashboard(groups: ObjectiveNode[]) {
  const bounties = groups.flatMap((group) => group.bounties);
  const bountyTotal = Math.max(1, bounties.length);
  const objectiveTotal = Math.max(1, groups.length);
  const settled = bounties.filter((bounty) => bounty.status === "settled").length;
  const review = bounties.filter((bounty) => bounty.status === "review").length;
  const unassigned = groups.filter((group) => group.objective.challengers.length === 0).length;
  const objectiveProgress = Math.round(average(groups.map((group) => group.objective.progress)));

  return {
    settled,
    review,
    unassigned,
    objectiveProgress,
    settledProgress: (settled / bountyTotal) * 100,
    reviewProgress: (review / bountyTotal) * 100,
    unassignedProgress: (unassigned / objectiveTotal) * 100,
  };
}

function orderIndex(ids: string[], id: string) {
  const index = ids.indexOf(id);
  return index >= 0 ? index : Number.MAX_SAFE_INTEGER;
}

function average(values: number[]) {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}
