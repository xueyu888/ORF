import type { Feedback } from "../../../types/orf";
import { feedbackCauseGroupsForCategories } from "./feedbackCategories";

const highImpactLevels = new Set<Feedback["impact"]>(["high", "critical"]);

export interface FeedbackInsights {
  highImpactCount: number;
  uncategorizedCount: number;
  averageResponseHours: number | null;
  topCause: string | null;
  causeChart: Array<{ cause: string; count: number }>;
}

export function summarizeFeedbackInsights(feedback: readonly Feedback[]): FeedbackInsights {
  const causeCounts = new Map<string, number>();
  const closedResponseHours: number[] = [];
  let highImpactCount = 0;
  let uncategorizedCount = 0;

  for (const item of feedback) {
    if (highImpactLevels.has(item.impact)) {
      highImpactCount += 1;
    }

    const rawCauses = uniqueCleanCauses(item.causeCategories);
    if (rawCauses.length === 0) {
      uncategorizedCount += 1;
    }

    for (const cause of feedbackCauseGroupsForCategories(rawCauses)) {
      causeCounts.set(cause, (causeCounts.get(cause) ?? 0) + 1);
    }

    if (item.stage === "closed") {
      const responseHours = hoursBetween(item.createdAt, item.closedAt ?? item.updatedAt);
      if (responseHours != null) {
        closedResponseHours.push(responseHours);
      }
    }
  }

  const causeChart = [...causeCounts.entries()]
    .map(([cause, count]) => ({ cause, count }))
    .sort((left, right) => right.count - left.count || left.cause.localeCompare(right.cause));

  return {
    highImpactCount,
    uncategorizedCount,
    averageResponseHours: average(closedResponseHours),
    topCause: causeChart[0]?.cause ?? null,
    causeChart,
  };
}

export function formatAverageResponseHours(value: number | null) {
  if (value == null) {
    return "暂无数据";
  }

  if (value > 0 && value < 1) {
    return "<1h";
  }

  return `${Math.round(value)}h`;
}

function uniqueCleanCauses(causes: readonly string[]) {
  return Array.from(new Set(causes.map((cause) => cause.trim()).filter(Boolean)));
}

function hoursBetween(start: string, end: string) {
  const startTime = new Date(start).getTime();
  const endTime = new Date(end).getTime();

  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime < startTime) {
    return null;
  }

  return (endTime - startTime) / (60 * 60 * 1000);
}

function average(values: readonly number[]) {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
