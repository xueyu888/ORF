import assert from "node:assert/strict";
import test from "node:test";
import { buildLeaderboardRows } from "../src/features/reports/model/leaderboard";
import type { Objective, OrfState, PointLedgerEntry } from "../src/types/orf";

const baseState = (): Pick<OrfState, "objectives" | "pointLedger" | "users"> => ({
  users: [
    { id: "00000000-0000-4000-8000-000000000307", name: "Ava", email: "ava@example.com", role: "member", status: "active" },
    { id: "00000000-0000-4000-8000-000000000308", name: "Bo", email: "bo@example.com", role: "member", status: "active" },
    { id: "00000000-0000-4000-8000-000000000309", name: "Cy", email: "cy@example.com", role: "member", status: "active" },
  ],
  objectives: [],
  pointLedger: [],
});

test("leaderboard quarter and year filters use the latest ledger period", () => {
  const state = baseState();
  state.pointLedger = [
    ledger({ id: "points-old", memberName: "Ava", points: 10, createdAt: "2999-01-15" }),
    ledger({ id: "points-q2-a", memberName: "Ava", points: 30, createdAt: "2999-04-02" }),
    ledger({ id: "points-q2-b", memberName: "Bo", points: 50, createdAt: "2999-05-20" }),
  ];
  state.objectives = [
    objective({ id: "obj-old", challengers: ["Ava"], updatedAt: "2999-01-20" }),
    objective({ id: "obj-q2-a", challengers: ["Ava"], updatedAt: "2999-04-03" }),
    objective({ id: "obj-q2-b", challengers: ["Bo"], updatedAt: "2999-05-21" }),
    objective({ id: "obj-future", challengers: ["Ava"], flowStatus: "open", acceptedResult: null, updatedAt: "2999-08-01" }),
  ];

  assert.deepEqual(buildLeaderboardRows(state, "quarter").map((row) => [row.memberName, row.points]), [["Bo", 50], ["Ava", 30]]);
  assert.deepEqual(buildLeaderboardRows(state, "year").map((row) => [row.memberName, row.points]), [["Bo", 50], ["Ava", 40]]);
  assert.deepEqual(buildLeaderboardRows(state, "all").map((row) => [row.memberName, row.points]), [["Bo", 50], ["Ava", 40]]);
});

test("leaderboard rank changes compare with the previous matching period", () => {
  const state = baseState();
  state.pointLedger = [
    ledger({ id: "points-q1-a", memberName: "Ava", points: 90, createdAt: "2999-01-15" }),
    ledger({ id: "points-q1-b", memberName: "Bo", points: 40, createdAt: "2999-01-16" }),
    ledger({ id: "points-q1-c", memberName: "Cy", points: 10, createdAt: "2999-01-17" }),
    ledger({ id: "points-q2-a", memberName: "Ava", points: 60, createdAt: "2999-04-15" }),
    ledger({ id: "points-q2-b", memberName: "Bo", points: 80, createdAt: "2999-04-16" }),
    ledger({ id: "points-q2-c", memberName: "Cy", points: 5, createdAt: "2999-04-17" }),
  ];

  assert.deepEqual(buildLeaderboardRows(state, "quarter").map((row) => [row.memberName, row.rank, row.rankChange]), [
    ["Bo", 1, 1],
    ["Ava", 2, -1],
    ["Cy", 3, 0],
  ]);
  assert.deepEqual(buildLeaderboardRows(state, "all").map((row) => [row.memberName, row.rankChange]), [
    ["Ava", 0],
    ["Bo", 0],
    ["Cy", 0],
  ]);
});

function ledger(overrides: Partial<PointLedgerEntry>): PointLedgerEntry {
  return {
    id: "points",
    objectiveId: "obj",
    memberName: "Ava",
    points: 10,
    reason: "settlement",
    createdAt: "2999-01-01",
    ...overrides,
  };
}

function objective(overrides: Partial<Objective>): Objective {
  return {
    id: "obj",
    title: "Objective",
    description: "Objective",
    whyItMatters: "Objective",
    cycle: "2999-Q1",
    stage: "goalFrozen",
    flowStatus: "settled",
    status: "On Track",
    confidence: 90,
    progress: 100,
    boundary: "Boundary",
    successDefinition: "Success",
    resultIds: [],
    taskIds: [],
    finalDueAt: "2999-12-31",
    challengers: ["Ava"],
    assignedChallengers: [],
    challengeApplications: [],
    acceptedAt: null,
    confirmationDueAt: null,
    confirmedAt: null,
    lootSubmittedAt: "2999-01-10T00:00:00.000Z",
    acceptedResult: "completed",
    completionMultiplier: 1,
    objectiveBasePoints: 10,
    objectiveSettlementPoints: 10,
    createdAt: "2999-01-01",
    updatedAt: "2999-01-10",
    ...overrides,
  };
}
