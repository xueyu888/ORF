import assert from "node:assert/strict";
import test from "node:test";
import { bountyCycleLabel } from "../src/features/bounty-hall/model/bountyHallSummary";
import type { Objective } from "../src/types/orf";

test("bountyCycleLabel returns an empty label without objectives", () => {
  assert.equal(bountyCycleLabel([]), "暂无周期");
});

test("bountyCycleLabel summarizes one or multiple live cycles", () => {
  assert.equal(bountyCycleLabel([objective({ cycle: "2999 Q1" })]), "2999 Q1");
  assert.equal(bountyCycleLabel([
    objective({ cycle: "2999 Q1" }),
    objective({ cycle: "2999 Q3" }),
    objective({ cycle: "2999 Q2" }),
    objective({ cycle: "2999 Q3" }),
  ]), "2999 Q3 等 3 个周期");
});

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
