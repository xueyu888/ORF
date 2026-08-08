import type { FeedbackImpact, FeedbackResolution, FeedbackStage } from "./index";
import { feedbackCauseGroupsForCategories, type TeamFeedbackCauseCategory } from "./categories";
import { feedbackIssueBodyPreview } from "./issueList";

export const feedbackDashboardSummaryDefaultItemLimit = 8;

export type FeedbackDashboardSummarySource = {
  readonly assigneeUserId?: string | null;
  readonly causeCategories: readonly string[];
  readonly description: string;
  readonly id: string;
  readonly impact: FeedbackImpact;
  readonly resolution: FeedbackResolution | null;
  readonly stage: FeedbackStage;
  readonly title: string;
  readonly updatedAt: string;
};

export type FeedbackDashboardSummaryItem = {
  readonly assigneeUserId?: string | null;
  readonly causeCategories: readonly string[];
  readonly descriptionPreview: string;
  readonly id: string;
  readonly impact: FeedbackImpact;
  readonly resolution: FeedbackResolution | null;
  readonly stage: Exclude<FeedbackStage, "closed">;
  readonly title: string;
  readonly updatedAt: string;
};

export type FeedbackDashboardCauseCount = {
  readonly cause: TeamFeedbackCauseCategory;
  readonly count: number;
};

export type FeedbackDashboardSummary = {
  readonly causeChart: readonly FeedbackDashboardCauseCount[];
  readonly highImpactCount: number;
  readonly pendingCount: number;
  readonly pendingItems: readonly FeedbackDashboardSummaryItem[];
};

export const emptyFeedbackDashboardSummary: FeedbackDashboardSummary = {
  causeChart: [],
  highImpactCount: 0,
  pendingCount: 0,
  pendingItems: [],
};

const feedbackDashboardHighImpactLevels = new Set<FeedbackImpact>(["high", "critical"]);

export function buildFeedbackDashboardSummary(input: {
  readonly feedback: readonly FeedbackDashboardSummarySource[];
  readonly itemLimit?: number;
}): FeedbackDashboardSummary {
  const itemLimit = Math.max(0, input.itemLimit ?? feedbackDashboardSummaryDefaultItemLimit);
  const pending = input.feedback.filter(isPendingFeedbackSummarySource);
  const causeCounts = new Map<TeamFeedbackCauseCategory, number>();

  for (const feedback of pending) {
    for (const cause of feedbackCauseGroupsForCategories(feedback.causeCategories)) {
      causeCounts.set(cause, (causeCounts.get(cause) ?? 0) + 1);
    }
  }

  return {
    causeChart: [...causeCounts.entries()]
      .map(([cause, count]) => ({ cause, count }))
      .sort((left, right) => right.count - left.count || left.cause.localeCompare(right.cause)),
    highImpactCount: pending.filter((feedback) => feedbackDashboardHighImpactLevels.has(feedback.impact)).length,
    pendingCount: pending.length,
    pendingItems: pending.slice(0, itemLimit).map(feedbackDashboardSummaryItem),
  };
}

function isPendingFeedbackSummarySource(
  feedback: FeedbackDashboardSummarySource,
): feedback is FeedbackDashboardSummarySource & { readonly stage: Exclude<FeedbackStage, "closed"> } {
  return feedback.stage !== "closed";
}

function feedbackDashboardSummaryItem(
  feedback: FeedbackDashboardSummarySource & { readonly stage: Exclude<FeedbackStage, "closed"> },
): FeedbackDashboardSummaryItem {
  return {
    assigneeUserId: feedback.assigneeUserId,
    causeCategories: [...feedback.causeCategories],
    descriptionPreview: feedbackIssueBodyPreview(feedback.description),
    id: feedback.id,
    impact: feedback.impact,
    resolution: feedback.resolution,
    stage: feedback.stage,
    title: feedback.title,
    updatedAt: feedback.updatedAt,
  };
}
