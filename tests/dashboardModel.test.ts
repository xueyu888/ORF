import assert from "node:assert/strict";
import test from "node:test";
import { summarizeDashboardState } from "../src/features/dashboard/model/dashboardSummary";
import type { Feedback, Objective, OrfUser, Result, Task } from "../src/types/orf";

test("summarizeDashboardState returns zero confidence for an empty objective list", () => {
  const summary = summarizeDashboardState({ objectives: [], results: [], feedback: [], tasks: [] });

  assert.equal(summary.averageConfidence, 0);
  assert.equal(Number.isNaN(summary.averageConfidence), false);
  assert.deepEqual(summary.activeObjectives, []);
  assert.deepEqual(summary.causeChart, []);
  assert.equal(summary.latestCycle, null);
});

test("summarizeDashboardState derives metrics from live state without demo offsets", () => {
  const summary = summarizeDashboardState({
    objectives: [
      objective({ id: "objective-active", flowStatus: "reestimating", confidence: 80, cycle: "2999 Q1" }),
      objective({ id: "objective-settled", flowStatus: "settled", confidence: 40, cycle: "2999 Q3" }),
      objective({ id: "objective-closed", flowStatus: "closed", confidence: 100, cycle: "2999 Q2" }),
    ],
    results: [
      result({ id: "result-risk", status: "At Risk" }),
      result({ id: "result-track", status: "On Track" }),
    ],
    feedback: [
      feedback({ id: "feedback-high", status: "New", impact: "High", causeCategories: ["Prompt 问题", "检索问题"] }),
      feedback({ id: "feedback-medium", status: "Reviewing", impact: "Medium", causeCategories: ["Prompt 问题"] }),
      feedback({ id: "feedback-closed", status: "Closed", impact: "Critical", causeCategories: ["工具调用失败"] }),
    ],
    tasks: [],
  });

  assert.deepEqual(summary.activeObjectives.map((item) => item.id), ["objective-active"]);
  assert.deepEqual(summary.atRiskResults.map((item) => item.id), ["result-risk"]);
  assert.deepEqual(summary.pendingFeedback.map((item) => item.id), ["feedback-high", "feedback-medium"]);
  assert.deepEqual(summary.highImpactFeedback.map((item) => item.id), ["feedback-high"]);
  assert.equal(summary.averageConfidence, 73);
  assert.deepEqual(summary.causeChart, [
    { cause: "Prompt 问题", count: 2 },
    { cause: "检索问题", count: 1 },
  ]);
  assert.equal(summary.latestCycle, "2999 Q3");
});

test("summarizeDashboardState returns only current user's open tasks", () => {
  const currentUser = user({ name: "Kai Wang" });
  const summary = summarizeDashboardState(
    {
      objectives: [],
      results: [],
      feedback: [],
      tasks: [
        task({ id: "task-mine", assignee: "Kai Wang", status: "Todo" }),
        task({ id: "task-done", assignee: "Kai Wang", status: "Done" }),
        task({ id: "task-other", assignee: "Lee Chen", status: "In Progress" }),
      ],
    },
    currentUser,
  );

  assert.deepEqual(summary.myOpenTasks.map((item) => item.id), ["task-mine"]);
});

function objective(input: Partial<Objective>): Objective {
  return {
    id: "objective",
    title: "Objective",
    description: "",
    whyItMatters: "",
    cycle: "2999 Q1",
    stage: "goalSetting",
    flowStatus: "candidate",
    status: "Draft",
    confidence: 0,
    progress: 0,
    boundary: "",
    successDefinition: "",
    resultIds: [],
    feedbackIds: [],
    taskIds: [],
    finalDueAt: "2999-03-31T00:00:00.000Z",
    challengers: [],
    assignedChallengers: [],
    challengeApplications: [],
    objectiveBasePoints: 0,
    createdAt: "2999-01-01T00:00:00.000Z",
    updatedAt: "2999-01-01T00:00:00.000Z",
    ...input,
  };
}

function result(input: Partial<Result>): Result {
  return {
    id: "result",
    objectiveId: "objective",
    title: "Result",
    description: "",
    metricName: "",
    baseline: 0,
    current: 0,
    target: 1,
    unit: "",
    direction: "increase",
    status: "On Track",
    confidence: 0,
    uncertaintyScore: 0,
    acceptedResult: "unreviewed",
    evidenceIds: [],
    taskIds: [],
    feedbackIds: [],
    trend: [],
    reviewCadence: "",
    ...input,
  };
}

function feedback(input: Partial<Feedback>): Feedback {
  return {
    id: "feedback",
    phenomenon: "",
    evidenceIds: [],
    causeCategories: [],
    impact: "Medium",
    linkedObjectiveId: "objective",
    linkedResultId: "result",
    suggestedAdjustment: "",
    source: "Team review",
    status: "New",
    owner: "Kai Wang",
    createdAt: "2999-01-01T00:00:00.000Z",
    updatedAt: "2999-01-01T00:00:00.000Z",
    activity: [],
    ...input,
  };
}

function task(input: Partial<Task>): Task {
  return {
    id: "task",
    title: "Task",
    description: "",
    status: "Todo",
    priority: "Medium",
    assignee: "Kai Wang",
    linkedObjectiveId: "objective",
    linkedResultId: "result",
    dueDate: "2999-01-10",
    tags: [],
    checklist: [],
    createdAt: "2999-01-01T00:00:00.000Z",
    updatedAt: "2999-01-01T00:00:00.000Z",
    ...input,
  };
}

function user(input: Partial<OrfUser>): OrfUser {
  return {
    id: "user-kai",
    name: "Kai Wang",
    email: "kai@example.com",
    role: "member",
    status: "active",
    ...input,
  };
}
