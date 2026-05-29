import assert from "node:assert/strict";
import test from "node:test";
import { challengeCycleOptions, challengeMemberOptions, filterChallengeGroups, sortChallengeGroups } from "../src/features/challenge/model/challengeFilters";
import type { BountyNode, ObjectiveNode } from "../src/features/challenge/model/types";
import type { Objective, Result } from "../src/types/orf";

test("challengeCycleOptions derives sorted live cycles", () => {
  assert.deepEqual(challengeCycleOptions([
    group({ objective: objective({ cycle: "2999 Q2" }) }),
    group({ objective: objective({ cycle: "2999 Q1" }) }),
    group({ objective: objective({ cycle: "2999 Q2" }) }),
  ]), ["2999 Q1", "2999 Q2"]);
});

test("challengeMemberOptions derives sorted unique formal challengers", () => {
  assert.deepEqual(challengeMemberOptions([
    group({ objective: objective({ challengers: ["Kai Wang", "Mia Chen"] }) }),
    group({ objective: objective({ challengers: ["Kai Wang"] }) }),
    group({ objective: objective({ challengers: [] }) }),
  ]), ["Kai Wang", "Mia Chen"]);
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

  const filtered = filterChallengeGroups(groups, { cycle: "2999 Q2", member: "all", status: "review" });

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

  const filtered = filterChallengeGroups(groups, { cycle: "all", member: "all", status: "unassigned" });

  assert.deepEqual(filtered.map((item) => item.objective.id), ["objective-unassigned"]);
  assert.deepEqual(filtered[0]?.bounties.map((item) => item.status), ["active", "review"]);
});

test("filterChallengeGroups filters by formal objective challengers", () => {
  const groups = [
    group({
      objective: objective({ id: "objective-kai", cycle: "2999 Q2", challengers: ["Kai Wang"] }),
      bounties: [bounty({ status: "active" }), bounty({ status: "review" })],
      challengers: ["Kai Wang"],
    }),
    group({
      objective: objective({ id: "objective-mia", cycle: "2999 Q2", challengers: ["Mia Chen"] }),
      bounties: [bounty({ status: "review" })],
      challengers: ["Mia Chen"],
    }),
    group({
      objective: objective({ id: "objective-kai-q1", cycle: "2999 Q1", challengers: ["Kai Wang"] }),
      bounties: [bounty({ status: "review" })],
      challengers: ["Kai Wang"],
    }),
  ];

  const filtered = filterChallengeGroups(groups, { cycle: "2999 Q2", member: "Kai Wang", status: "review" });

  assert.deepEqual(filtered.map((item) => item.objective.id), ["objective-kai"]);
  assert.deepEqual(filtered[0]?.bounties.map((item) => item.status), ["review"]);
});

test("sortChallengeGroups preserves source order for objectives with identical business sort keys", () => {
  const groups = [
    group({ objective: objective({ id: "objective-draft", title: "" }) }),
    group({ objective: objective({ id: "objective-z", title: "ZZZ 同键目标" }) }),
    group({ objective: objective({ id: "objective-a", title: "AAA 同键目标" }) }),
  ];

  const sorted = sortChallengeGroups(groups);

  assert.deepEqual(sorted.map((item) => item.objective.id), ["objective-draft", "objective-z", "objective-a"]);
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
    feedbackIds: [],
    trend: [],
    reviewCadence: "",
    ...input,
  };
}
