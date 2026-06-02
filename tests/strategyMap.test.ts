import assert from "node:assert/strict";
import test from "node:test";
import { buildStrategyMap } from "../src/features/strategy/model/strategyMap";
import type { Objective, Result, Task } from "../src/types/orf";

test("buildStrategyMap returns an empty model without live ORF records", () => {
  const map = buildStrategyMap({ objectives: [], results: [], tasks: [] });

  assert.deepEqual(map.layers, []);
  assert.equal(map.defaultSelected, null);
});

test("buildStrategyMap derives layers and progress from live state", () => {
  const map = buildStrategyMap({
    objectives: [
      objective({ id: "objective-q1", cycle: "2999 Q1", progress: 20, challengers: ["Mia"] }),
      objective({ id: "objective-q2", cycle: "2999 Q2", progress: 80, challengers: ["Kai"] }),
    ],
    results: [
      result({ id: "result-live", objectiveId: "objective-q1", confidence: 70 }),
      result({ id: "result-orphan", objectiveId: "missing-objective", confidence: 10 }),
    ],
    tasks: [
      task({ id: "task-review", linkedObjectiveId: "objective-q1", status: "In Review" }),
      task({ id: "task-orphan", linkedObjectiveId: "missing-objective", status: "In Progress" }),
    ],
  });

  assert.equal(map.defaultSelected?.title, "当前 ORF 目标组合");
  assert.equal(map.defaultSelected?.progress, 50);
  assert.deepEqual(map.layers.map((layer) => layer.id), ["portfolio", "cycles", "objectives", "results", "tasks"]);
  assert.deepEqual(map.layers.find((layer) => layer.id === "cycles")?.nodes.map((node) => [node.title, node.progress]), [
    ["2999 Q1", 20],
    ["2999 Q2", 80],
  ]);
  assert.deepEqual(map.layers.find((layer) => layer.id === "results")?.nodes.map((node) => node.id), ["result-live"]);
  assert.deepEqual(map.layers.find((layer) => layer.id === "tasks")?.nodes.map((node) => [node.id, node.progress]), [["task-review", 80]]);
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
    feedbackIds: [],
    trend: [],
    reviewCadence: "",
    createdAt: "2999-01-01T00:00:00.000Z",
    updatedAt: "2999-01-01T00:00:00.000Z",
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
    dueDate: "2999-01-10",
    tags: [],
    checklist: [],
    createdAt: "2999-01-01T00:00:00.000Z",
    updatedAt: "2999-01-01T00:00:00.000Z",
    ...input,
  };
}
