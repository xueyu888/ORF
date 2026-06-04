import assert from "node:assert/strict";
import test from "node:test";
import { formatAverageResponseHours, summarizeFeedbackInsights } from "../src/features/feedback/model/feedbackInsights";
import type { Feedback } from "../src/types/orf";

test("summarizeFeedbackInsights derives counts and charts from feedback", () => {
  const insights = summarizeFeedbackInsights([
    feedback({
      id: "feedback-high",
      impact: "High",
      causeCategories: ["真实风险原因", "真实风险原因", "  "],
    }),
    feedback({
      id: "feedback-uncategorized",
      impact: "Medium",
      causeCategories: [],
    }),
    feedback({
      id: "feedback-closed",
      impact: "Critical",
      status: "Closed",
      causeCategories: ["真实风险原因", "真实系统原因"],
      createdAt: "2999-01-01T00:00:00.000Z",
      updatedAt: "2999-01-02T12:00:00.000Z",
    }),
  ]);

  assert.equal(insights.highImpactCount, 2);
  assert.equal(insights.uncategorizedCount, 1);
  assert.equal(insights.averageResponseHours, 36);
  assert.equal(insights.topCause, "真实风险原因");
  assert.deepEqual(insights.causeChart, [
    { cause: "真实风险原因", count: 2 },
    { cause: "真实系统原因", count: 1 },
  ]);
});

test("summarizeFeedbackInsights returns empty values when feedback has no measurable signal", () => {
  const insights = summarizeFeedbackInsights([
    feedback({
      causeCategories: [" "],
      status: "Closed",
      createdAt: "not-a-date",
      updatedAt: "2999-01-01T00:00:00.000Z",
    }),
  ]);

  assert.equal(insights.highImpactCount, 0);
  assert.equal(insights.uncategorizedCount, 1);
  assert.equal(insights.averageResponseHours, null);
  assert.equal(insights.topCause, null);
  assert.deepEqual(insights.causeChart, []);
});

test("formatAverageResponseHours formats missing and sub-hour values", () => {
  assert.equal(formatAverageResponseHours(null), "暂无数据");
  assert.equal(formatAverageResponseHours(0.5), "<1h");
  assert.equal(formatAverageResponseHours(18.4), "18h");
  assert.equal(formatAverageResponseHours(18.5), "19h");
});

function feedback(input: Partial<Feedback> = {}): Feedback {
  return {
    id: "feedback",
    phenomenon: "",
    causeCategories: [],
    impact: "Medium",
    suggestedAdjustment: "",
    status: "Open",
    owner: "Kai Wang",
    createdAt: "2999-01-01T00:00:00.000Z",
    updatedAt: "2999-01-01T00:00:00.000Z",
    activity: [],
    ...input,
  };
}
