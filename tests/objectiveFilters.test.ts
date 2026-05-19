import assert from "node:assert/strict";
import test from "node:test";
import { filterObjectives, objectiveCycleOptions } from "../src/features/objectives/model/objectiveFilters";
import type { Objective } from "../src/types/orf";

test("objectiveCycleOptions derives sorted live cycles without blanks", () => {
  assert.deepEqual(objectiveCycleOptions([
    objective({ cycle: "2999 Q2" }),
    objective({ cycle: "2999 Q1" }),
    objective({ cycle: "2999 Q2" }),
    objective({ cycle: " " }),
  ]), ["2999 Q1", "2999 Q2"]);
});

test("filterObjectives applies query, status, and cycle filters", () => {
  const objectives = [
    objective({ id: "objective-q1", title: "真实 Q1 目标", cycle: "2999 Q1", status: "On Track" }),
    objective({ id: "objective-q2", title: "真实 Q2 目标", cycle: "2999 Q2", status: "At Risk" }),
    objective({ id: "objective-other", title: "其他目标", cycle: "2999 Q2", status: "On Track" }),
  ];

  const filtered = filterObjectives(objectives, {
    cycle: "2999 Q2",
    query: "真实",
    status: "At Risk",
  });

  assert.deepEqual(filtered.map((item) => item.id), ["objective-q2"]);
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
