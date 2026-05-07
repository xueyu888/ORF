import type { AutomaticCompletionResult, Evidence, Feedback, Objective, Result, Task } from "../../../types/orf";
import { resultProgress } from "../../../utils/format";
import { addDays, bountyDeadline, bountyUpdatedAt, latestDate } from "./challengeDates";
import { bountyDifficulty, bountyStatus } from "./challengeStatus";
import type { BountyNode, ObjectiveNode } from "./types";

export function buildChallengeTree(
  input: {
    automaticCompletions: Record<string, AutomaticCompletionResult>;
    evidence: Evidence[];
    feedback: Feedback[];
    objectives: Objective[];
    results: Result[];
    submittedLootIds: Set<string>;
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
      const bounties = orderedResults.map((result, index) => {
        const actions = input.tasks.filter((task) => task.linkedResultId === result.id);

        return {
          result,
          actions,
          status: bountyStatus(result, actions, input.automaticCompletions[result.objectiveId]?.rets[result.id], input.submittedLootIds.has(result.id)),
          deadline: bountyDeadline(actions),
          updatedAt: bountyUpdatedAt(result, actions, input.feedback, input.evidence),
          progress: resultProgress(result),
          kind: index === 0 ? "主线" : "支线",
          difficulty: bountyDifficulty(result),
        } satisfies BountyNode;
      });

      return {
        objective,
        bounties,
        challengers: unique(bounties.map((bounty) => bounty.result.owner)),
        deadline: latestDate(bounties.map((bounty) => bounty.deadline)) || addDays(objective.updatedAt, 7),
      };
    });
}

export function summarizeDashboard(groups: ObjectiveNode[]) {
  const bounties = groups.flatMap((group) => group.bounties);
  const total = Math.max(1, bounties.length);
  const settled = bounties.filter((bounty) => bounty.status === "settled").length;
  const review = bounties.filter((bounty) => bounty.status === "review").length;
  const unclaimed = bounties.filter((bounty) => !bounty.result.owner).length;
  const objectiveProgress = Math.round(average(groups.map((group) => group.objective.progress)));

  return {
    settled,
    review,
    unclaimed,
    objectiveProgress,
    settledProgress: (settled / total) * 100,
    reviewProgress: (review / total) * 100,
    unclaimedProgress: (unclaimed / total) * 100,
  };
}

function orderIndex(ids: string[], id: string) {
  const index = ids.indexOf(id);
  return index >= 0 ? index : Number.MAX_SAFE_INTEGER;
}

function average(values: number[]) {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}
