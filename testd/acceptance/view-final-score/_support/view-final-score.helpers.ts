import { and, eq, sql } from "drizzle-orm";
import { closeDb, db } from "../../../../server/db/client";
import { objectives, pointLedger, teamMembers, users } from "../../../../server/db/schema";
import type { FinalScoreLedger, FinalScoreTarget, ViewFinalScoreCaseData } from "./view-final-score.context";

export async function closeViewFinalScoreTestDb() {
  await closeDb();
}

export async function memberAccountActive(email: string) {
  const account = await readMemberAccount(email);
  return !!account && account.role === "member" && account.status === "active";
}

export async function finalScoreTargetAvailable(data: Pick<ViewFinalScoreCaseData, "email">) {
  return (await selectFinalScoreTarget(data)) !== null;
}

export async function selectFinalScoreTarget(data: Pick<ViewFinalScoreCaseData, "email">): Promise<FinalScoreTarget | null> {
  const member = await readMemberAccount(data.email);
  if (!member) {
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
    .where(eq(objectives.teamId, member.teamId));

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

export async function prepareFinalScoreTarget(target: FinalScoreTarget, memberName: string, points: number) {
  await db
    .update(objectives)
    .set({
      stage: "goalFrozen",
      flowStatus: "settled",
      challengers: [memberName],
      acceptedResult: "completed",
      completionMultiplier: 1,
      objectiveBasePoints: points,
      objectiveSettlementPoints: points,
      updatedAt: today(),
    })
    .where(eq(objectives.id, target.objective.id));
}

export async function createFinalScoreLedger(
  target: FinalScoreTarget,
  data: Pick<ViewFinalScoreCaseData, "email" | "name" | "points" | "reason">,
): Promise<FinalScoreLedger> {
  const member = await readMemberAccount(data.email);
  const objective = await readObjective(target.objective.id);
  if (!member || !objective) {
    throw new Error("无法创建最终分数测试积分流水");
  }

  const ledger: FinalScoreLedger = {
    id: `points-testd-final-score-${Date.now()}`,
    objectiveId: objective.id,
    memberName: data.name,
    points: data.points,
    reason: data.reason,
  };

  await db.insert(pointLedger).values({
    id: ledger.id,
    teamId: objective.teamId,
    objectiveId: objective.id,
    userId: member.userId,
    memberName: data.name,
    points: data.points,
    reason: data.reason,
    createdAt: new Date().toISOString(),
  });

  return ledger;
}

export async function restoreFinalScoreTarget(target: FinalScoreTarget | null) {
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

export async function deleteFinalScoreLedger(reason: string, ledger?: FinalScoreLedger | null) {
  if (ledger?.id) {
    await db.delete(pointLedger).where(eq(pointLedger.id, ledger.id));
  }
  await db.delete(pointLedger).where(eq(pointLedger.reason, reason));
}

export async function testFinalScoreLedgerAbsent(reason: string) {
  return (await readLedgerByReason(reason)) === null;
}

export async function finalScoreTargetSettledForMember(target: FinalScoreTarget, memberName: string) {
  const objective = await readObjective(target.objective.id);
  return !!objective && objective.flowStatus === "settled" && objective.challengers.includes(memberName);
}

export async function finalScoreLedgerPresent(target: FinalScoreTarget, memberName: string, points: number) {
  const row = await readLedger(target.objective.id, memberName);
  return !!row && row.points === points;
}

async function readLedgerByReason(reason: string) {
  const [row] = await db.select({ id: pointLedger.id }).from(pointLedger).where(eq(pointLedger.reason, reason)).limit(1);
  return row ?? null;
}

async function readLedger(objectiveId: string, memberName: string) {
  const [row] = await db
    .select({ id: pointLedger.id, points: pointLedger.points })
    .from(pointLedger)
    .where(and(eq(pointLedger.objectiveId, objectiveId), eq(pointLedger.memberName, memberName)))
    .limit(1);
  return row ?? null;
}

async function readObjective(objectiveId: string) {
  const [row] = await db
    .select({
      id: objectives.id,
      teamId: objectives.teamId,
      flowStatus: objectives.flowStatus,
      challengers: objectives.challengers,
    })
    .from(objectives)
    .where(eq(objectives.id, objectiveId))
    .limit(1);

  return row ?? null;
}

async function readMemberAccount(email: string): Promise<{
  userId: string;
  teamId: string;
  role: string;
  status: string;
} | null> {
  const [row] = await db
    .select({
      userId: users.id,
      teamId: teamMembers.teamId,
      role: teamMembers.role,
      status: users.status,
    })
    .from(users)
    .innerJoin(teamMembers, eq(teamMembers.userId, users.id))
    .where(sql`lower(${users.email}) = ${email.toLowerCase()}`)
    .limit(1);

  return row ?? null;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}
