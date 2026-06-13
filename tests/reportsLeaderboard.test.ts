import assert from "node:assert/strict";
import test from "node:test";
import { buildLeaderboardRows } from "../src/features/reports/model/leaderboard";
import type { Objective, PointLedgerEntry, OrfUser } from "../src/types/orf";

const users: OrfUser[] = [
  { id: "user-a", name: "成员甲", email: "a@example.com", role: "member", status: "active" },
  { id: "user-b", name: "成员乙", email: "b@example.com", role: "member", status: "active" },
  { id: "user-c", name: "临时参与", email: "c@example.com", role: "member", status: "active" },
];

function objective(input: Partial<Objective>): Objective {
  return {
    acceptedResult: "completed",
    assignedChallengerUserIds: [],
    assignedChallengers: [],
    boundary: "",
    challengeApplications: [],
    challengerUserIds: ["user-a", "user-b", "user-c"],
    challengers: ["成员甲", "成员乙", "临时参与"],
    confidence: 100,
    confirmationDueAt: null,
    createdAt: "2026-06-13",
    cycle: "2026-Q2",
    description: "",
    finalDueAt: "2026-06-13",
    flowStatus: "settled",
    id: "objective-1",
    lootSubmittedAt: "2026-06-13T09:00:00.000Z",
    objectiveBasePoints: 100,
    objectiveSettlementPoints: 100,
    progress: 100,
    projectId: null,
    resultIds: [],
    stage: "goalFrozen",
    status: "On Track",
    successDefinition: "",
    taskIds: [],
    title: "正式验收目标",
    updatedAt: "2026-06-13",
    whyItMatters: "",
    ...input,
  };
}

function ledger(input: Partial<PointLedgerEntry>): PointLedgerEntry {
  return {
    createdAt: "2026-06-13T10:00:00.000Z",
    id: `ledger-${input.memberName}`,
    memberName: "成员甲",
    objectiveId: "objective-1",
    points: 0,
    reason: "验收结算",
    userId: "user-a",
    ...input,
  };
}

function state(input: {
  objectives?: Objective[];
  pointLedger?: PointLedgerEntry[];
  users?: OrfUser[];
}) {
  return {
    objectives: [],
    pointLedger: [],
    users,
    ...input,
  };
}

test("leaderboard counts only formal participants with point ledger rows", () => {
  const rows = buildLeaderboardRows(
    state({
      objectives: [objective({})],
      pointLedger: [
        ledger({ memberName: "成员甲", points: 60, userId: "user-a" }),
        ledger({ memberName: "成员乙", points: 40, userId: "user-b" }),
      ],
    }),
    "all",
  );

  assert.deepEqual(rows.map((row) => row.memberName), ["成员甲", "成员乙"]);
  assert.equal(rows.find((row) => row.memberName === "临时参与"), undefined);
  assert.equal(rows[0]?.completionRate, 100);
});

test("leaderboard keeps formal failed evaluations with zero points", () => {
  const rows = buildLeaderboardRows(
    state({
      objectives: [objective({ acceptedResult: "abandoned", objectiveSettlementPoints: 0 })],
      pointLedger: [
        ledger({ memberName: "成员甲", points: 0, userId: "user-a" }),
        ledger({ memberName: "成员乙", points: 0, userId: "user-b" }),
      ],
    }),
    "all",
  );

  const rowsByMember = new Map(rows.map((row) => [row.memberName, row]));
  assert.deepEqual([...rowsByMember.keys()].sort(), ["成员乙", "成员甲"].sort());
  assert.equal(rowsByMember.get("成员甲")?.points, 0);
  assert.equal(rowsByMember.get("成员乙")?.points, 0);
  assert.equal(rowsByMember.get("成员甲")?.completionRate, 0);
  assert.equal(rowsByMember.get("成员乙")?.completionRate, 0);
});
