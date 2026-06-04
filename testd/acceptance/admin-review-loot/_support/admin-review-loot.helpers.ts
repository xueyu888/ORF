import { and, eq } from "drizzle-orm";
import { db } from "../../../_operators/testd-db-client";
import { objectiveLoot, objectives, pointLedger, results } from "../../../../server/db/schema";
import type { AdminReviewLootCaseData, ReviewLoot, ReviewLootResult, ReviewLootTarget } from "./admin-review-loot.context";

export async function reviewLootTargetFromObjective(objectiveId: string): Promise<ReviewLootTarget> {
  const selected = await readObjective(objectiveId);
  if (!selected) {
    throw new Error(`管理员验收战利品目标不存在: ${objectiveId}`);
  }

  return {
    objective: {
      id: selected.id,
      teamId: selected.teamId,
      title: selected.title,
      stage: selected.stage,
      flowStatus: selected.flowStatus,
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
    id: "res-testd-admin-review-loot",
    objectiveId: objective.id,
    title: input.resultTitle,
    points: input.points,
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
    uncertaintyLevel: "进阶",
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
    createdAt: today(),
    updatedAt: today(),
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
    id: "loot-testd-admin-review-loot",
    objectiveId: objective.id,
    body: input.lootBody,
    submittedBy: input.memberName,
    resultClaims: [{ resultId: result.id, claim: "completed", evidenceText: input.evidenceText }],
  };

  await db.insert(objectiveLoot).values({
    id: loot.id,
    teamId: objective.teamId,
    objectiveId: objective.id,
    submittedBy: input.memberName,
    body: input.lootBody,
    resultClaims: loot.resultClaims,
    selfTestReportUrl: null,
    selfTestReportBody: null,
    submittedAt: new Date().toISOString(),
  });

  return loot;
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

export async function reviewLootTargetSubmitted(target: ReviewLootTarget, memberName: string) {
  const objective = await readObjective(target.objective.id);
  return (
    !!objective &&
    objective.flowStatus === "submitted" &&
    objective.stage === "goalFrozen" &&
    !!objective.lootSubmittedAt &&
    objective.challengers.length === 1 &&
    objective.challengers[0] === memberName
  );
}

export async function reviewLootTargetSettled(target: ReviewLootTarget, points: number) {
  const [row] = await db
    .select({
      flowStatus: objectives.flowStatus,
      stage: objectives.stage,
      acceptedResult: objectives.acceptedResult,
      objectiveBasePoints: objectives.objectiveBasePoints,
      objectiveSettlementPoints: objectives.objectiveSettlementPoints,
    })
    .from(objectives)
    .where(eq(objectives.id, target.objective.id))
    .limit(1);

  return (
    !!row &&
    row.flowStatus === "settled" &&
    row.stage === "goalFrozen" &&
    row.acceptedResult === "completed" &&
    row.objectiveBasePoints === points &&
    row.objectiveSettlementPoints === points
  );
}

export async function reviewLootResultPresent(target: ReviewLootTarget, result: ReviewLootResult, points: number) {
  const row = await readResultByTitle(result.title);
  return !!row && row.id === result.id && row.objectiveId === target.objective.id && row.uncertaintyScore === points;
}

export async function reviewLootResultAccepted(result: ReviewLootResult) {
  const row = await readResultByTitle(result.title);
  return !!row && row.id === result.id && row.acceptedResult === "completed";
}

export async function reviewLootPresent(target: ReviewLootTarget, loot: ReviewLoot, result: ReviewLootResult) {
  const row = await readLootByBody(loot.body);
  return (
    !!row &&
    row.id === loot.id &&
    row.objectiveId === target.objective.id &&
    row.submittedBy === loot.submittedBy &&
    row.resultClaims.some((claim) => claim.resultId === result.id && claim.claim === "completed")
  );
}

export async function reviewLootLedgerPresent(target: ReviewLootTarget, memberName: string, points: number, reason: string) {
  const [row] = await db
    .select({ points: pointLedger.points, reason: pointLedger.reason })
    .from(pointLedger)
    .where(and(eq(pointLedger.objectiveId, target.objective.id), eq(pointLedger.memberName, memberName)))
    .limit(1);

  return !!row && row.points === points && row.reason === reason;
}

export function lootPagePath(target: ReviewLootTarget) {
  return `/tasks/objectives/${encodeURIComponent(target.objective.id)}/loot`;
}

async function readResultByTitle(title: string) {
  const [row] = await db
    .select({
      id: results.id,
      objectiveId: results.objectiveId,
      uncertaintyScore: results.uncertaintyScore,
      acceptedResult: results.acceptedResult,
    })
    .from(results)
    .where(eq(results.title, title))
    .limit(1);
  return row ?? null;
}

async function readLootByBody(body: string) {
  const [row] = await db
    .select({
      id: objectiveLoot.id,
      objectiveId: objectiveLoot.objectiveId,
      submittedBy: objectiveLoot.submittedBy,
      resultClaims: objectiveLoot.resultClaims,
    })
    .from(objectiveLoot)
    .where(eq(objectiveLoot.body, body))
    .limit(1);
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
      title: objectives.title,
      stage: objectives.stage,
      flowStatus: objectives.flowStatus,
      challengers: objectives.challengers,
      lootSubmittedAt: objectives.lootSubmittedAt,
    })
    .from(objectives)
    .where(eq(objectives.id, objectiveId))
    .limit(1);

  return row ?? null;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
