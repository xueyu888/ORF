import type { Feedback, Objective, OrfUser, Result, Task } from "../../../types/orf";
import { feedbackCauseGroupsForCategories } from "../../feedback/model/feedbackCategories";

const inactiveObjectiveStatuses = new Set<Objective["flowStatus"]>(["settled", "closed"]);
const highImpactLevels = new Set<Feedback["impact"]>(["high", "critical"]);

export interface DashboardSummary {
  activeObjectives: Objective[];
  atRiskResults: Result[];
  pendingFeedback: Feedback[];
  highImpactFeedback: Feedback[];
  averageConfidence: number;
  causeChart: Array<{ cause: string; count: number }>;
  latestCycle: string | null;
  myOpenTasks: Task[];
}

export function summarizeDashboardState(input: DashboardSummaryInput, currentUser?: Pick<OrfUser, "id"> | null): DashboardSummary {
  const pendingFeedback = input.feedbackIssues.filter((feedback) => feedback.stage !== "closed");
  const causeCounts = new Map<string, number>();

  for (const feedback of pendingFeedback) {
    for (const cause of feedbackCauseGroupsForCategories(feedback.causeCategories)) {
      causeCounts.set(cause, (causeCounts.get(cause) ?? 0) + 1);
    }
  }

  return {
    activeObjectives: input.objectives.filter((objective) => !inactiveObjectiveStatuses.has(objective.flowStatus)),
    atRiskResults: input.results.filter((result) => result.status === "At Risk"),
    pendingFeedback,
    highImpactFeedback: pendingFeedback.filter((feedback) => highImpactLevels.has(feedback.impact)),
    averageConfidence: averageObjectiveConfidence(input.objectives),
    causeChart: [...causeCounts.entries()]
      .map(([cause, count]) => ({ cause, count }))
      .sort((left, right) => right.count - left.count || left.cause.localeCompare(right.cause)),
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
  feedbackIssues: Feedback[];
  tasks: Task[];
}
