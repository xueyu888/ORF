import type { Feedback, Objective, OrfUser, Result, Task } from "../../../types/orf";

const inactiveObjectiveStatuses = new Set<Objective["flowStatus"]>(["settled", "closed"]);
const highImpactLevels = new Set<Feedback["impact"]>(["High", "Critical"]);

export interface DashboardSummary {
  activeObjectives: Objective[];
  atRiskResults: Result[];
  pendingFeedback: Feedback[];
  highImpactFeedback: Feedback[];
  averageConfidence: number;
  causeChart: Array<{ cause: string; count: number }>;
  myOpenTasks: Task[];
}

export function summarizeDashboardState(state: DashboardSummaryInput, currentUser?: Pick<OrfUser, "name"> | null): DashboardSummary {
  const pendingFeedback = state.feedback.filter((feedback) => feedback.status !== "Closed");
  const causeCounts = new Map<string, number>();

  for (const feedback of pendingFeedback) {
    for (const cause of feedback.causeCategories) {
      causeCounts.set(cause, (causeCounts.get(cause) ?? 0) + 1);
    }
  }

  return {
    activeObjectives: state.objectives.filter((objective) => !inactiveObjectiveStatuses.has(objective.flowStatus)),
    atRiskResults: state.results.filter((result) => result.status === "At Risk"),
    pendingFeedback,
    highImpactFeedback: pendingFeedback.filter((feedback) => highImpactLevels.has(feedback.impact)),
    averageConfidence: averageObjectiveConfidence(state.objectives),
    causeChart: [...causeCounts.entries()]
      .map(([cause, count]) => ({ cause, count }))
      .sort((left, right) => right.count - left.count || left.cause.localeCompare(right.cause)),
    myOpenTasks: currentUser
      ? state.tasks.filter((task) => task.assignee === currentUser.name && task.status !== "Done")
      : [],
  };
}

function averageObjectiveConfidence(objectives: Objective[]) {
  if (objectives.length === 0) {
    return 0;
  }

  return Math.round(objectives.reduce((sum, objective) => sum + objective.confidence, 0) / objectives.length);
}

interface DashboardSummaryInput {
  objectives: Objective[];
  results: Result[];
  feedback: Feedback[];
  tasks: Task[];
}
