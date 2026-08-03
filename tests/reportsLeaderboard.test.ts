import assert from "node:assert/strict";
import test from "node:test";
import { buildLeaderboardRangeBounds, buildLeaderboardRows, buildSettlementDaySummaries } from "../src/domain/reportsLeaderboard";
import type { Objective, ObjectiveAcceptanceReview, PointLedgerEntry, OrfUser, OrfUserDisplayProfile } from "../src/types/orf";

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
    settlementPeriodAt: input.createdAt ?? "2026-06-13T10:00:00.000Z",
    userId: "user-a",
    ...input,
  };
}

function acceptanceReview(input: Partial<ObjectiveAcceptanceReview>): ObjectiveAcceptanceReview {
  return {
    acceptedResult: "completed",
    id: `acceptance-${input.objectiveId ?? "objective-1"}-${input.acceptedResult ?? "completed"}`,
    lootId: "loot-1",
    objectiveId: "objective-1",
    reason: null,
    resultReviews: [],
    reviewedAt: "2026-06-13T10:00:00.000Z",
    reviewerUserId: "admin-1",
    ...input,
  };
}

function state(input: {
  objectiveAcceptanceReviews?: ObjectiveAcceptanceReview[];
  objectives?: Objective[];
  pointLedger?: PointLedgerEntry[];
  userProfiles?: OrfUserDisplayProfile[];
  users?: OrfUser[];
}) {
  return {
    objectiveAcceptanceReviews: [],
    objectives: [],
    pointLedger: [],
    userProfiles: [],
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
  assert.equal(rows[0]?.rankChange.kind, "unavailable");
});

test("leaderboard uses public user display profiles when full users are not loaded", () => {
  const rows = buildLeaderboardRows(
    state({
      objectives: [objective({})],
      pointLedger: [
        ledger({ memberName: "c8ddd02a-c56d-42ee-874d-ada6d36f44ab", points: 40, userId: "user-b" }),
        ledger({ memberName: "5038c983-8509-4f91-a935-d92fa6bdde65", points: 30, userId: "user-c" }),
      ],
      userProfiles: [
        { avatarUrl: "/api/users/user-b/avatar?v=avatar-b", id: "user-b", name: "汪万庆" },
        { avatarUrl: "/api/users/user-c/avatar?v=avatar-c", id: "user-c", name: "夏伟" },
      ],
      users: [{ id: "user-a", name: "当前用户", email: "current@example.com", role: "admin", status: "active" }],
    }),
    "all",
  );

  assert.deepEqual(rows.map((row) => row.memberName), ["汪万庆", "夏伟"]);
  assert.equal(rows[0]?.avatarUrl, "/api/users/user-b/avatar?v=avatar-b");
  assert.equal(rows[1]?.avatarUrl, "/api/users/user-c/avatar?v=avatar-c");
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

test("leaderboard treats objectives with failed acceptance history as unfinished even after later settlement", () => {
  const rows = buildLeaderboardRows(
    state({
      objectiveAcceptanceReviews: [
        acceptanceReview({
          acceptedResult: "abandoned",
          objectiveId: "objective-reworked",
          reason: "验收不通过，需返工",
          resultReviews: [{ resultId: "result-1", acceptedResult: "failed" }],
          reviewedAt: "2026-06-13T10:00:00.000Z",
        }),
        acceptanceReview({
          acceptedResult: "completed",
          objectiveId: "objective-reworked",
          resultReviews: [{ resultId: "result-1", acceptedResult: "completed" }],
          reviewedAt: "2026-06-13T15:00:00.000Z",
        }),
      ],
      objectives: [
        objective({
          acceptedResult: "completed",
          flowStatus: "settled",
          id: "objective-reworked",
          title: "先返工后结算目标",
        }),
        objective({
          acceptedResult: "completed",
          flowStatus: "settled",
          id: "objective-clean",
          title: "一次验收通过目标",
        }),
      ],
      pointLedger: [
        ledger({
          id: "ledger-reworked-a",
          objectiveId: "objective-reworked",
          points: 60,
          userId: "user-a",
        }),
        ledger({
          id: "ledger-clean-a",
          objectiveId: "objective-clean",
          points: 40,
          userId: "user-a",
        }),
      ],
    }),
    "all",
  );

  assert.equal(rows.find((row) => row.userId === "user-a")?.completionRate, 50);
});

test("quarterly leaderboard marks members without previous period ranks as new", () => {
  const rows = buildLeaderboardRows(
    state({
      objectives: [objective({})],
      pointLedger: [
        ledger({ memberName: "成员甲", points: 60, userId: "user-a" }),
        ledger({ memberName: "成员乙", points: 40, userId: "user-b" }),
      ],
    }),
    "quarter",
    "2026-06-30",
  );

  assert.equal(rows[0]?.rankChange.kind, "new");
  assert.equal(rows[1]?.rankChange.kind, "new");
});

test("monthly leaderboard compares against the previous rolling month window", () => {
  const rows = buildLeaderboardRows(
    state({
      objectives: [
        objective({ id: "objective-april", createdAt: "2026-04-15", updatedAt: "2026-04-15" }),
        objective({ id: "objective-may", createdAt: "2026-05-15", updatedAt: "2026-05-15" }),
        objective({ id: "objective-june", createdAt: "2026-06-13", updatedAt: "2026-06-13" }),
      ],
      pointLedger: [
        ledger({
          createdAt: "2026-04-15T10:00:00.000Z",
          id: "ledger-april-a",
          memberName: "成员甲",
          objectiveId: "objective-april",
          points: 500,
          userId: "user-a",
        }),
        ledger({
          createdAt: "2026-05-15T10:00:00.000Z",
          id: "ledger-may-a",
          memberName: "成员甲",
          objectiveId: "objective-may",
          points: 10,
          userId: "user-a",
        }),
        ledger({
          createdAt: "2026-05-15T10:00:00.000Z",
          id: "ledger-may-b",
          memberName: "成员乙",
          objectiveId: "objective-may",
          points: 20,
          userId: "user-b",
        }),
        ledger({
          createdAt: "2026-06-13T10:00:00.000Z",
          id: "ledger-june-a",
          memberName: "成员甲",
          objectiveId: "objective-june",
          points: 30,
          userId: "user-a",
        }),
        ledger({
          createdAt: "2026-06-13T10:00:00.000Z",
          id: "ledger-june-b",
          memberName: "成员乙",
          objectiveId: "objective-june",
          points: 20,
          userId: "user-b",
        }),
      ],
    }),
    "month",
    "2026-06-30",
  );

  assert.equal(rows.find((row) => row.memberName === "成员甲")?.points, 30);
  assert.equal(rows.find((row) => row.memberName === "成员甲")?.completionRate, 100);
  assert.deepEqual(rows.find((row) => row.memberName === "成员甲")?.rankChange, {
    delta: 1,
    direction: "up",
    kind: "moved",
    previousRank: 2,
  });
  assert.deepEqual(rows.find((row) => row.memberName === "成员乙")?.rankChange, {
    delta: 1,
    direction: "down",
    kind: "moved",
    previousRank: 1,
  });
});

test("monthly leaderboard assigns settlement to final acceptance period instead of ledger write time", () => {
  const rows = buildLeaderboardRows(
    state({
      objectives: [
        objective({ id: "objective-may", createdAt: "2026-05-15", updatedAt: "2026-05-15" }),
        objective({ id: "objective-boundary", createdAt: "2026-06-30", updatedAt: "2026-07-01" }),
      ],
      pointLedger: [
        ledger({
          createdAt: "2026-05-15T10:00:00.000Z",
          id: "ledger-may-a",
          memberName: "成员甲",
          objectiveId: "objective-may",
          points: 10,
          settlementPeriodAt: "2026-05-15T10:00:00.000Z",
          userId: "user-a",
        }),
        ledger({
          createdAt: "2026-05-15T10:00:00.000Z",
          id: "ledger-may-b",
          memberName: "成员乙",
          objectiveId: "objective-may",
          points: 20,
          settlementPeriodAt: "2026-05-15T10:00:00.000Z",
          userId: "user-b",
        }),
        ledger({
          createdAt: "2026-07-01T09:00:00.000Z",
          id: "ledger-boundary-a",
          memberName: "成员甲",
          objectiveId: "objective-boundary",
          points: 30,
          settlementPeriodAt: "2026-06-30T18:00:00.000Z",
          userId: "user-a",
        }),
      ],
    }),
    "month",
    "2026-06-30",
  );

  assert.equal(rows.find((row) => row.memberName === "成员甲")?.points, 30);
  assert.equal(rows.find((row) => row.memberName === "成员甲")?.completionRate, 100);
  assert.deepEqual(rows.find((row) => row.memberName === "成员甲")?.rankChange, {
    delta: 1,
    direction: "up",
    kind: "moved",
    previousRank: 2,
  });
});

test("leaderboard rolling range uses the selected end date and includes that day", () => {
  assert.deepEqual(buildLeaderboardRangeBounds("month", "2026-08-03"), {
    end: "2026-08-03",
    endExclusive: "2026-08-04",
    start: "2026-07-03",
  });
  assert.deepEqual(buildLeaderboardRangeBounds("quarter", "2026-08-03"), {
    end: "2026-08-03",
    endExclusive: "2026-08-04",
    start: "2026-05-03",
  });
  assert.deepEqual(buildLeaderboardRangeBounds("year", "2026-08-03"), {
    end: "2026-08-03",
    endExclusive: "2026-08-04",
    start: "2025-08-03",
  });
});

test("leaderboard custom range uses explicit inclusive start and end dates", () => {
  assert.deepEqual(buildLeaderboardRangeBounds("custom", { customRange: { end: "2026-08-20", start: "2026-07-01" } }), {
    end: "2026-08-20",
    endExclusive: "2026-08-21",
    start: "2026-07-01",
  });
  assert.deepEqual(buildLeaderboardRangeBounds("custom", { customRange: { end: "2026-07-01", start: "2026-08-20" } }), {
    end: "2026-08-20",
    endExclusive: "2026-08-21",
    start: "2026-07-01",
  });
});

test("custom leaderboard filters by explicit settlement range without rank comparison", () => {
  const rows = buildLeaderboardRows(
    state({
      objectives: [objective({})],
      pointLedger: [
        ledger({
          createdAt: "2026-06-30T10:00:00.000Z",
          id: "ledger-before-custom",
          memberName: "成员甲",
          points: 900,
          settlementPeriodAt: "2026-06-30T10:00:00.000Z",
          userId: "user-a",
        }),
        ledger({
          createdAt: "2026-07-01T10:00:00.000Z",
          id: "ledger-custom-start",
          memberName: "成员甲",
          points: 30,
          settlementPeriodAt: "2026-07-01T10:00:00.000Z",
          userId: "user-a",
        }),
        ledger({
          createdAt: "2026-08-20T10:00:00.000Z",
          id: "ledger-custom-end",
          memberName: "成员甲",
          points: 20,
          settlementPeriodAt: "2026-08-20T10:00:00.000Z",
          userId: "user-a",
        }),
        ledger({
          createdAt: "2026-08-21T10:00:00.000Z",
          id: "ledger-after-custom",
          memberName: "成员乙",
          points: 800,
          settlementPeriodAt: "2026-08-21T10:00:00.000Z",
          userId: "user-b",
        }),
      ],
    }),
    "custom",
    { customRange: { end: "2026-08-20", start: "2026-07-01" } },
  );

  assert.deepEqual(rows.map((row) => row.memberName), ["成员甲"]);
  assert.equal(rows[0]?.points, 50);
  assert.equal(rows[0]?.rankChange.kind, "unavailable");
});

test("settlement day summaries aggregate points by settlement period date", () => {
  const summaries = buildSettlementDaySummaries([
    ledger({
      createdAt: "2026-08-04T10:00:00.000Z",
      id: "ledger-late-write",
      points: 30,
      settlementPeriodAt: "2026-08-03T18:00:00.000Z",
    }),
    ledger({
      createdAt: "2026-08-03T10:00:00.000Z",
      id: "ledger-same-day",
      points: -5,
      settlementPeriodAt: "2026-08-03T09:00:00.000Z",
    }),
  ]);

  assert.deepEqual(summaries, [{ count: 2, date: "2026-08-03", points: 25 }]);
});

test("quarterly rank change compares against the full previous period ranking", () => {
  const previousLeaders = Array.from({ length: 11 }, (_, index) =>
    ledger({
      createdAt: "2026-03-10T10:00:00.000Z",
      id: `ledger-history-${index}`,
      memberName: `历史成员${index + 1}`,
      objectiveId: "objective-previous",
      points: 100 - index,
      userId: `history-${index}`,
    }),
  );

  const rows = buildLeaderboardRows(
    state({
      objectives: [
        objective({ id: "objective-previous", createdAt: "2026-03-10", updatedAt: "2026-03-10" }),
        objective({ id: "objective-current", createdAt: "2026-06-13", updatedAt: "2026-06-13" }),
      ],
      pointLedger: [
        ...previousLeaders,
        ledger({
          createdAt: "2026-03-10T10:00:00.000Z",
          id: "ledger-previous-c",
          memberName: "成员丙",
          objectiveId: "objective-previous",
          points: 1,
          userId: "user-c",
        }),
        ledger({
          createdAt: "2026-06-13T10:00:00.000Z",
          id: "ledger-current-c",
          memberName: "成员丙",
          objectiveId: "objective-current",
          points: 80,
          userId: "user-c",
        }),
        ledger({
          createdAt: "2026-06-13T10:00:00.000Z",
          id: "ledger-current-a",
          memberName: "成员甲",
          objectiveId: "objective-current",
          points: 40,
          userId: "user-a",
        }),
      ],
    }),
    "quarter",
    "2026-06-30",
  );

  const renamedMember = rows.find((row) => row.userId === "user-c");
  assert.equal(renamedMember?.memberName, "临时参与");
  assert.deepEqual(renamedMember?.rankChange, {
    delta: 11,
    direction: "up",
    kind: "moved",
    previousRank: 12,
  });
  assert.equal(rows.find((row) => row.userId === "user-a")?.rankChange.kind, "new");
});
