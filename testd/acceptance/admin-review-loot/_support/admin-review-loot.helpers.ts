import { and, eq, sql } from "drizzle-orm";
import { closeDb, db } from "../../../../server/db/client";
import { objectiveLoot, objectives, pointLedger, results, teamMembers, users } from "../../../../server/db/schema";
import type { AdminReviewLootCaseData, ReviewLoot, ReviewLootResult, ReviewLootTarget } from "./admin-review-loot.context";

export async function closeAdminReviewLootTestDb() {
  await closeDb();
}

export async function adminAccountActive(email: string) {
  const account = await readAccount(email);
  return !!account && account.role === "admin" && account.status === "active";
}

export async function memberAccountActive(name: string) {
  const account = await readAccountByName(name);
  return !!account && account.role === "member" && account.status === "active";
}

export async function reviewLootTargetAvailable() {
  return (await selectReviewLootTarget()) !== null;
}

export async function selectReviewLootTarget(): Promise<ReviewLootTarget | null> {
  const objectiveRows = await db
    .select({
      id: objectives.id,
      title: objectives.title,
      finalDueAt: objectives.finalDueAt,
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
    .from(objectives);

  const resultRows = await db.select({ objectiveId: results.objectiveId }).from(results);
  const lootRows = await db.select({ objectiveId: objectiveLoot.objectiveId }).from(objectiveLoot);
  const ledgerRows = await db.select({ objectiveId: pointLedger.objectiveId }).from(pointLedger);
  const resultCountByObjective = countByObjective(resultRows);
  const lootCountByObjective = countByObjective(lootRows);
  const ledgerCountByObjective = countByObjective(ledgerRows);

  const titleCounts = new Map<string, number>();
  for (const row of objectiveRows) {
    titleCounts.set(row.title, (titleCounts.get(row.title) ?? 0) + 1);
  }

  const selected = objectiveRows.find((row) => {
    if (titleCounts.get(row.title) !== 1) return false;
    if ((resultCountByObjective.get(row.id) ?? 0) !== 0) return false;
    if ((lootCountByObjective.get(row.id) ?? 0) !== 0) return false;
    if ((ledgerCountByObjective.get(row.id) ?? 0) !== 0) return false;
    if (row.flowStatus === "settled" || row.flowStatus === "closed") return false;
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
      finalDueAt: selected.finalDueAt,
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

export async function prepareReviewLootTarget(target: ReviewLootTarget, memberName: string) {
  await db
    .update(objectives)
    .set({
      finalDueAt: addDays(today(), 14),
      stage: "goalFrozen",
      flowStatus: "submitted",
      challengers: [memberName],
      lootSubmittedAt: new Date().toISOString(),
      acceptedResult: null,
      completionMultiplier: null,
      objectiveBasePoints: 0,
      objectiveSettlementPoints: null,
      updatedAt: today(),
    })
    .where(eq(objectives.id, target.objective.id));
}

export async function createReviewLootResult(
  target: ReviewLootTarget,
  input: Pick<AdminReviewLootCaseData, "resultTitle" | "metricName" | "points">,
): Promise<ReviewLootResult> {
  const objective = await readObjective(target.objective.id);
  if (!objective) {
    throw new Error("目标不存在，无法创建验收前置指标");
  }

  const result: ReviewLootResult = {
    id: `res-testd-review-${Date.now()}`,
    objectiveId: objective.id,
    title: input.resultTitle,
  };

  await db.insert(results).values({
    id: result.id,
    teamId: objective.teamId,
    objectiveId: objective.id,
    title: input.resultTitle,
    description: "用于管理员验收战利品测试的前置指标。",
    metricName: input.metricName,
    metricRequirement: `${input.metricName}：用于管理员验收战利品测试。`,
    statisticalObject: null,
    completionStandard: null,
    sampleSet: null,
    measurementScope: null,
    uncertaintyLevel: null,
    baseline: 0,
    current: 0,
    target: 100,
    unit: "%",
    direction: "increase",
    status: "Draft",
    confidence: 50,
    source: "managerDefined",
    definer: "testd",
    uncertaintyScore: input.points,
    acceptedResult: "unreviewed",
    reviewCadence: "Weekly",
    sortOrder: 0,
  });

  return result;
}

export async function createReviewLoot(
  target: ReviewLootTarget,
  result: ReviewLootResult,
  input: Pick<AdminReviewLootCaseData, "lootBody" | "evidenceText" | "memberName">,
): Promise<ReviewLoot> {
  const objective = await readObjective(target.objective.id);
  if (!objective) {
    throw new Error("目标不存在，无法创建测试战利品");
  }

  const loot: ReviewLoot = {
    id: `loot-testd-review-${Date.now()}`,
    objectiveId: objective.id,
    body: input.lootBody,
  };

  await db.insert(objectiveLoot).values({
    id: loot.id,
    teamId: objective.teamId,
    objectiveId: objective.id,
    submittedBy: input.memberName,
    body: input.lootBody,
    resultClaims: [{ resultId: result.id, claim: "completed", evidenceText: input.evidenceText }],
    selfTestReportUrl: null,
    selfTestReportBody: null,
    submittedAt: new Date().toISOString(),
  });

  return loot;
}

export async function restoreReviewLootTarget(target: ReviewLootTarget | null) {
  if (!target) {
    return;
  }

  await db
    .update(objectives)
    .set({
      finalDueAt: target.previous.finalDueAt,
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

export async function deleteReviewLootResult(title: string, result?: ReviewLootResult | null) {
  if (result?.id) {
    await db.delete(results).where(eq(results.id, result.id));
  }
  await db.delete(results).where(eq(results.title, title));
}

export async function deleteReviewLoot(body: string, loot?: ReviewLoot | null) {
  if (loot?.id) {
    await db.delete(objectiveLoot).where(eq(objectiveLoot.id, loot.id));
  }
  await db.delete(objectiveLoot).where(eq(objectiveLoot.body, body));
}

export async function deleteReviewLootLedger(reason: string) {
  await db.delete(pointLedger).where(eq(pointLedger.reason, reason));
}

export async function testReviewLootResultAbsent(title: string) {
  return (await readResultByTitle(title)) === null;
}

export async function testReviewLootAbsent(body: string) {
  return (await readLootByBody(body)) === null;
}

export async function testReviewLootLedgerAbsent(reason: string) {
  return (await readLedgerByReason(reason)) === null;
}

export async function reviewLootTargetSubmitted(target: ReviewLootTarget) {
  const objective = await readObjective(target.objective.id);
  return !!objective && objective.flowStatus === "submitted";
}

export async function reviewLootTargetSettled(target: ReviewLootTarget, points: number) {
  const [row] = await db
    .select({
      flowStatus: objectives.flowStatus,
      acceptedResult: objectives.acceptedResult,
      objectiveSettlementPoints: objectives.objectiveSettlementPoints,
    })
    .from(objectives)
    .where(eq(objectives.id, target.objective.id))
    .limit(1);

  return !!row && row.flowStatus === "settled" && row.acceptedResult === "completed" && row.objectiveSettlementPoints === points;
}

export async function reviewLootResultPresent(target: ReviewLootTarget, result: ReviewLootResult) {
  const row = await readResultByTitle(result.title);
  return !!row && row.id === result.id && row.objectiveId === target.objective.id;
}

export async function reviewLootPresent(target: ReviewLootTarget, loot: ReviewLoot) {
  const row = await readLootByBody(loot.body);
  return !!row && row.id === loot.id && row.objectiveId === target.objective.id;
}

export async function reviewLootLedgerPresent(target: ReviewLootTarget, memberName: string, points: number) {
  const [row] = await db
    .select({ points: pointLedger.points })
    .from(pointLedger)
    .where(and(eq(pointLedger.objectiveId, target.objective.id), eq(pointLedger.memberName, memberName)))
    .limit(1);

  return !!row && row.points === points;
}

export function lootPagePath(target: ReviewLootTarget) {
  return `/objectives/${encodeURIComponent(target.objective.id)}/loot`;
}

async function readResultByTitle(title: string) {
  const [row] = await db.select({ id: results.id, objectiveId: results.objectiveId }).from(results).where(eq(results.title, title)).limit(1);
  return row ?? null;
}

async function readLootByBody(body: string) {
  const [row] = await db.select({ id: objectiveLoot.id, objectiveId: objectiveLoot.objectiveId }).from(objectiveLoot).where(eq(objectiveLoot.body, body)).limit(1);
  return row ?? null;
}

async function readLedgerByReason(reason: string) {
  const [row] = await db.select({ id: pointLedger.id }).from(pointLedger).where(eq(pointLedger.reason, reason)).limit(1);
  return row ?? null;
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

async function readAccount(email: string) {
  const [row] = await db
    .select({ role: teamMembers.role, status: users.status })
    .from(users)
    .innerJoin(teamMembers, eq(teamMembers.userId, users.id))
    .where(sql`lower(${users.email}) = ${email.toLowerCase()}`)
    .limit(1);

  return row ?? null;
}

async function readAccountByName(name: string) {
  const [row] = await db
    .select({ role: teamMembers.role, status: users.status })
    .from(users)
    .innerJoin(teamMembers, eq(teamMembers.userId, users.id))
    .where(eq(users.name, name))
    .limit(1);

  return row ?? null;
}

function countByObjective(rows: Array<{ objectiveId: string }>) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.objectiveId, (counts.get(row.objectiveId) ?? 0) + 1);
  }
  return counts;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
