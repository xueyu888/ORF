import assert from "node:assert/strict";
import test from "node:test";
import { challengeCycleOptions, filterChallengeGroups } from "../src/features/challenge/model/challengeFilters";
import type { BountyNode, ObjectiveNode } from "../src/features/challenge/model/types";
import type { Objective, Result } from "../src/types/orf";

test("challengeCycleOptions derives sorted live cycles", () => {
  assert.deepEqual(challengeCycleOptions([
    group({ objective: objective({ cycle: "2999 Q2" }) }),
    group({ objective: objective({ cycle: "2999 Q1" }) }),
    group({ objective: objective({ cycle: "2999 Q2" }) }),
  ]), ["2999 Q1", "2999 Q2"]);
});

test("filterChallengeGroups filters by cycle and bounty status", () => {
  const groups = [
    group({
      objective: objective({ id: "objective-q1", cycle: "2999 Q1" }),
      bounties: [bounty({ status: "active" })],
    }),
    group({
      objective: objective({ id: "objective-q2", cycle: "2999 Q2" }),
      bounties: [bounty({ status: "review" }), bounty({ status: "settled" })],
    }),
  ];

  const filtered = filterChallengeGroups(groups, { cycle: "2999 Q2", status: "review" });

  assert.deepEqual(filtered.map((item) => item.objective.id), ["objective-q2"]);
  assert.deepEqual(filtered[0]?.bounties.map((item) => item.status), ["review"]);
});

test("filterChallengeGroups filters unassigned objectives at objective level", () => {
  const groups = [
    group({
      objective: objective({ id: "objective-unassigned", challengers: [] }),
      bounties: [bounty({ status: "active" }), bounty({ status: "review" })],
      challengers: [],
    }),
    group({
      objective: objective({ id: "objective-assigned", challengers: ["Kai Wang"] }),
      bounties: [bounty({ status: "active" })],
      challengers: ["Kai Wang"],
    }),
  ];

  const filtered = filterChallengeGroups(groups, { cycle: "all", status: "unassigned" });

  assert.deepEqual(filtered.map((item) => item.objective.id), ["objective-unassigned"]);
  assert.deepEqual(filtered[0]?.bounties.map((item) => item.status), ["active", "review"]);
});

function group(input: Partial<ObjectiveNode> = {}): ObjectiveNode {
  const objectiveItem = input.objective ?? objective();
  return {
    objective: objectiveItem,
    bounties: [],
    challengers: objectiveItem.challengers,
    deadline: objectiveItem.finalDueAt,
    ...input,
  };
}

function bounty(input: Partial<BountyNode> = {}): BountyNode {
  return {
    difficulty: "进阶",
    progress: 0,
    result: result(),
    status: "active",
    updatedAt: "2999-01-01",
    ...input,
  };
}

function objective(input: Partial<Objective> = {}): Objective {
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

function result(input: Partial<Result> = {}): Result {
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
