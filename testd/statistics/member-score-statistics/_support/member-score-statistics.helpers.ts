import { and, eq, sql } from "drizzle-orm";
import { closeDb, db } from "../../../../server/db/client";
import { objectives, pointLedger, teamMembers, users } from "../../../../server/db/schema";
import type { MemberScoreStatisticsCaseData, ScoreLedgerInput, ScoreStatisticsTarget } from "./member-score-statistics.context";

export async function closeMemberScoreStatisticsTestDb() {
  await closeDb();
}

export async function adminAccountActive(email: string) {
  const account = await readAccountByEmail(email);
  return !!account && account.role === "admin" && account.status === "active";
}

export async function memberAccountActive(name: string) {
  const account = await readAccountByName(name);
  return !!account && account.role === "member" && account.status === "active";
}

export async function scoreStatisticsTargetAvailable(data: Pick<MemberScoreStatisticsCaseData, "adminEmail">) {
  return (await selectScoreStatisticsTarget(data)) !== null;
}

export async function selectScoreStatisticsTarget(data: Pick<MemberScoreStatisticsCaseData, "adminEmail">): Promise<ScoreStatisticsTarget | null> {
  const admin = await readAccountByEmail(data.adminEmail);
  if (!admin) {
    return null;
  }

  const objectiveRows = await db
    .select({
      id: objectives.id,
      title: objectives.title,
      stage: objectives.stage,
      flowStatus: objectives.flowStatus,
      status: objectives.status,
      challengers: objectives.challengers,
      assignedChallengers: objectives.assignedChallengers,
      challengeApplications: objectives.challengeApplications,
      acceptedAt: objectives.acceptedAt,
      confirmationDueAt: objectives.confirmationDueAt,
      confirmedAt: objectives.confirmedAt,
      lootSubmittedAt: objectives.lootSubmittedAt,
      acceptedResult: objectives.acceptedResult,
      completionMultiplier: objectives.completionMultiplier,
      objectiveBasePoints: objectives.objectiveBasePoints,
      objectiveSettlementPoints: objectives.objectiveSettlementPoints,
      updatedAt: objectives.updatedAt,
      updatedBy: objectives.updatedBy,
    })
    .from(objectives)
    .where(eq(objectives.teamId, admin.teamId));

  const ledgerRows = await db.select({ objectiveId: pointLedger.objectiveId }).from(pointLedger);
  const ledgerCountByObjective = new Map<string, number>();
  for (const row of ledgerRows) {
    ledgerCountByObjective.set(row.objectiveId, (ledgerCountByObjective.get(row.objectiveId) ?? 0) + 1);
  }

  const titleCounts = new Map<string, number>();
  for (const row of objectiveRows) {
    titleCounts.set(row.title, (titleCounts.get(row.title) ?? 0) + 1);
  }

  const selected = objectiveRows.find((row) => {
    if (titleCounts.get(row.title) !== 1) return false;
    if ((ledgerCountByObjective.get(row.id) ?? 0) !== 0) return false;
    if (row.flowStatus === "closed") return false;
    return true;
  });

  if (!selected) {
    return null;
  }

  return {
    objective: {
      id: selected.id,
      title: selected.title,
    },
    previous: {
      id: selected.id,
      title: selected.title,
      stage: selected.stage,
      flowStatus: selected.flowStatus,
      status: selected.status,
      challengers: selected.challengers,
      assignedChallengers: selected.assignedChallengers,
      challengeApplications: selected.challengeApplications,
      acceptedAt: selected.acceptedAt,
      confirmationDueAt: selected.confirmationDueAt,
      confirmedAt: selected.confirmedAt,
      lootSubmittedAt: selected.lootSubmittedAt,
      acceptedResult: selected.acceptedResult,
      completionMultiplier: selected.completionMultiplier,
      objectiveBasePoints: selected.objectiveBasePoints,
      objectiveSettlementPoints: selected.objectiveSettlementPoints,
      updatedAt: selected.updatedAt,
      updatedBy: selected.updatedBy,
    },
  };
}

export async function prepareScoreStatisticsTarget(target: ScoreStatisticsTarget, members: string[], points: number) {
  await db
    .update(objectives)
    .set({
      stage: "goalFrozen",
      flowStatus: "settled",
      challengers: members,
      acceptedResult: "completed",
      completionMultiplier: 1,
      objectiveBasePoints: points,
      objectiveSettlementPoints: points,
      updatedAt: today(),
    })
    .where(eq(objectives.id, target.objective.id));
}

export async function createScoreLedgers(target: ScoreStatisticsTarget, ledgers: ScoreLedgerInput[], reason: string) {
  const objective = await readObjective(target.objective.id);
  if (!objective) {
    throw new Error("目标不存在，无法创建成员分数统计测试积分流水");
  }

  const accounts = await Promise.all(ledgers.map((ledger) => readAccountByName(ledger.memberName)));
  await db.insert(pointLedger).values(
    ledgers.map((ledger, index) => ({
      id: `points-testd-score-statistics-${Date.now()}-${index}`,
      teamId: objective.teamId,
      objectiveId: objective.id,
      userId: accounts[index]?.userId ?? null,
      memberName: ledger.memberName,
      points: ledger.points,
      reason,
      createdAt: new Date().toISOString(),
    })),
  );
}

export async function restoreScoreStatisticsTarget(target: ScoreStatisticsTarget | null) {
  if (!target) {
    return;
  }

  await db
    .update(objectives)
    .set({
      stage: target.previous.stage,
      flowStatus: target.previous.flowStatus,
      status: target.previous.status,
      challengers: target.previous.challengers,
      assignedChallengers: target.previous.assignedChallengers,
      challengeApplications: target.previous.challengeApplications,
      acceptedAt: target.previous.acceptedAt,
      confirmationDueAt: target.previous.confirmationDueAt,
      confirmedAt: target.previous.confirmedAt,
      lootSubmittedAt: target.previous.lootSubmittedAt,
      acceptedResult: target.previous.acceptedResult,
      completionMultiplier: target.previous.completionMultiplier,
      objectiveBasePoints: target.previous.objectiveBasePoints,
      objectiveSettlementPoints: target.previous.objectiveSettlementPoints,
      updatedAt: target.previous.updatedAt,
      updatedBy: target.previous.updatedBy,
    })
    .where(eq(objectives.id, target.objective.id));
}

export async function deleteScoreLedgers(reason: string) {
  await db.delete(pointLedger).where(eq(pointLedger.reason, reason));
}

export async function testScoreLedgersAbsent(reason: string) {
  return (await readLedgersByReason(reason)).length === 0;
}

export async function scoreStatisticsTargetSettled(target: ScoreStatisticsTarget) {
  const objective = await readObjective(target.objective.id);
  return !!objective && objective.flowStatus === "settled";
}

export async function scoreLedgerPresent(target: ScoreStatisticsTarget, memberName: string, points: number) {
  const [row] = await db
    .select({ points: pointLedger.points })
    .from(pointLedger)
    .where(and(eq(pointLedger.objectiveId, target.objective.id), eq(pointLedger.memberName, memberName)))
    .limit(1);

  return !!row && row.points === points;
}

export async function scoreLedgerTotalForMember(target: ScoreStatisticsTarget, memberName: string) {
  const objective = await readObjective(target.objective.id);
  if (!objective) {
    throw new Error("目标不存在，无法读取成员积分汇总");
  }

  const [row] = await db
    .select({ points: sql`coalesce(sum(${pointLedger.points}), 0)`.mapWith(Number) })
    .from(pointLedger)
    .where(and(eq(pointLedger.teamId, objective.teamId), eq(pointLedger.memberName, memberName)))
    .limit(1);

  return row?.points ?? 0;
}

async function readLedgersByReason(reason: string) {
  return db.select({ id: pointLedger.id }).from(pointLedger).where(eq(pointLedger.reason, reason));
}

async function readObjective(objectiveId: string) {
  const [row] = await db
    .select({
      id: objectives.id,
      teamId: objectives.teamId,
      flowStatus: objectives.flowStatus,
    })
    .from(objectives)
    .where(eq(objectives.id, objectiveId))
    .limit(1);

  return row ?? null;
}

async function readAccountByEmail(email: string) {
  const [row] = await db
    .select({ userId: users.id, teamId: teamMembers.teamId, role: teamMembers.role, status: users.status })
    .from(users)
    .innerJoin(teamMembers, eq(teamMembers.userId, users.id))
    .where(sql`lower(${users.email}) = ${email.toLowerCase()}`)
    .limit(1);

  return row ?? null;
}

async function readAccountByName(name: string) {
  const [row] = await db
    .select({ userId: users.id, role: teamMembers.role, status: users.status })
    .from(users)
    .innerJoin(teamMembers, eq(teamMembers.userId, users.id))
    .where(eq(users.name, name))
    .limit(1);

  return row ?? null;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}
