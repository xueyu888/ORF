import type { Objective, WorkStatus } from "../../../types/orf";

export type ObjectiveCycleFilter = "All" | string;
export type ObjectiveStatusFilter = "All" | WorkStatus;

export interface ObjectiveFilters {
  cycle: ObjectiveCycleFilter;
  query: string;
  status: ObjectiveStatusFilter;
}

export function objectiveCycleOptions(objectives: readonly Objective[]) {
  return Array.from(new Set(objectives.map((objective) => objective.cycle.trim()).filter(Boolean))).sort((left, right) => left.localeCompare(right));
}

export function filterObjectives(objectives: readonly Objective[], filters: ObjectiveFilters) {
  const query = filters.query.trim().toLowerCase();

  return objectives.filter((objective) => {
    const queryMatch = !query || `${objective.title} ${objective.description} ${objective.whyItMatters}`.toLowerCase().includes(query);
    const statusMatch = filters.status === "All" || objective.status === filters.status;
    const cycleMatch = filters.cycle === "All" || objective.cycle === filters.cycle;
    return queryMatch && statusMatch && cycleMatch;
  });
}
