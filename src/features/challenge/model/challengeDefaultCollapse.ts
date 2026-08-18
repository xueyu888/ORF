import { isObjectiveAcceptedByFlow, isObjectiveSettledOrClosed } from "../../../domain/orfLifecycle";
import type { ObjectiveNode } from "./types";

export function objectiveDefaultsCollapsedInChallengeTree(objective: ObjectiveNode["objective"]) {
  return isObjectiveAcceptedByFlow(objective) || isObjectiveSettledOrClosed(objective);
}

export function defaultCollapsedObjectiveIdsForChallengeTree(groups: readonly ObjectiveNode[]) {
  return new Set(groups
    .filter((group) => objectiveDefaultsCollapsedInChallengeTree(group.objective))
    .map((group) => group.objective.id));
}

export function mergeNewDefaultCollapsedObjectiveIds({
  appliedDefaultCollapsedIds,
  currentCollapsedIds,
  defaultCollapsedIds,
}: {
  readonly appliedDefaultCollapsedIds: ReadonlySet<string>;
  readonly currentCollapsedIds: Set<string>;
  readonly defaultCollapsedIds: ReadonlySet<string>;
}) {
  let changed = false;
  const nextAppliedDefaultCollapsedIds = new Set(appliedDefaultCollapsedIds);
  const nextCollapsedIds = new Set(currentCollapsedIds);

  for (const objectiveId of defaultCollapsedIds) {
    if (nextAppliedDefaultCollapsedIds.has(objectiveId)) continue;
    nextAppliedDefaultCollapsedIds.add(objectiveId);
    if (nextCollapsedIds.has(objectiveId)) continue;
    nextCollapsedIds.add(objectiveId);
    changed = true;
  }

  return {
    appliedDefaultCollapsedIds: nextAppliedDefaultCollapsedIds,
    collapsedIds: changed ? nextCollapsedIds : currentCollapsedIds,
  };
}
