import type { FeedbackDashboardSummary, FeedbackDashboardSummaryItem } from "@orf/feedback-module/contracts";
import type { Objective, OrfUser, Result, Task } from "../../../types/orf";

const inactiveObjectiveStatuses = new Set<Objective["flowStatus"]>(["settled", "closed"]);

export interface DashboardSummary {
  activeObjectives: Objective[];
  atRiskResults: Result[];
  pendingFeedback: readonly FeedbackDashboardSummaryItem[];
  pendingFeedbackCount: number;
  highImpactFeedbackCount: number;
  averageConfidence: number;
  causeChart: FeedbackDashboardSummary["causeChart"];
  latestCycle: string | null;
  myOpenTasks: Task[];
}

export function summarizeDashboardState(input: DashboardSummaryInput, currentUser?: Pick<OrfUser, "id"> | null): DashboardSummary {
  return {
    activeObjectives: input.objectives.filter((objective) => !inactiveObjectiveStatuses.has(objective.flowStatus)),
    atRiskResults: input.results.filter((result) => result.status === "At Risk"),
    pendingFeedback: input.feedbackSummary.pendingItems,
    pendingFeedbackCount: input.feedbackSummary.pendingCount,
    highImpactFeedbackCount: input.feedbackSummary.highImpactCount,
    averageConfidence: averageObjectiveConfidence(input.objectives),
    causeChart: input.feedbackSummary.causeChart,
    latestCycle: latestObjectiveCycle(input.objectives),
    myOpenTasks: currentUser
      ? input.tasks.filter((task) => task.assigneeUserId === currentUser.id && task.status !== "Done")
      : [],
  };
}

function averageObjectiveConfidence(objectives: Objective[]) {
  if (objectives.length === 0) {
    return 0;
  }

  return Math.round(objectives.reduce((sum, objective) => sum + objective.confidence, 0) / objectives.length);
}

function latestObjectiveCycle(objectives: Objective[]) {
  const cycles = objectives.map((objective) => objective.cycle.trim()).filter(Boolean).sort((left, right) => left.localeCompare(right));
  return cycles.at(-1) ?? null;
}

interface DashboardSummaryInput {
  objectives: Objective[];
  results: Result[];
  feedbackSummary: FeedbackDashboardSummary;
  tasks: Task[];
}
