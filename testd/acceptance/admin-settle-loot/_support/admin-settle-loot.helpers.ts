import { and, eq } from "drizzle-orm";
import { db } from "../../../_operators/testd-db-client";
import { objectiveLoot, objectives, pointLedger, results } from "../../../../server/db/schema";
import {
  readTestUserIdByNameInTeam,
  requiredTestUserIdByNameInTeam,
  requiredTestUserIdForTeam,
} from "../../../_operators/common.helpers";
import { testResultDetail } from "../../../_operators/result-detail.helpers";
import type {
  AdminSettleLootCaseData,
  SettleLoot,
  SettleLootResult,
  SettleLootTarget,
} from "./admin-settle-loot.context";

export async function settleLootTargetFromObjective(objectiveId: string): Promise<SettleLootTarget> {
  const selected = await readObjective(objectiveId);
  if (!selected) {
    throw new Error(`管理员结算目标不存在: ${objectiveId}`);
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

export async function prepareSettleLootTarget(target: SettleLootTarget, memberName: string, points: number) {
  const memberUserId = await requiredTestUserIdByNameInTeam({
    teamId: target.objective.teamId,
    name: memberName,
  });

  await db
    .update(objectives)
    .set({
      finalDueAt: addDays(today(), 14),
      stage: "goalFrozen",
      flowStatus: "accepted",
      challengers: [memberName],
      challengerUserIds: [memberUserId],
      assignedChallengers: [],
      assignedChallengerUserIds: [],
      lootSubmittedAt: new Date().toISOString(),
      acceptedResult: "completed",
      completionMultiplier: 1,
      objectiveBasePoints: points,
      objectiveSettlementPoints: null,
      updatedAt: today(),
    })
    .where(eq(objectives.id, target.objective.id));
}

export async function createSettleLootResult(
  target: SettleLootTarget,
  input: Pick<AdminSettleLootCaseData, "resultTitle" | "metricName" | "points">,
): Promise<SettleLootResult> {
  const objective = await readObjective(target.objective.id);
  if (!objective) {
    throw new Error("目标不存在，无法创建结算前置指标");
  }

  const result: SettleLootResult = {
    id: `res-${objective.id}`,
    objectiveId: objective.id,
    title: input.resultTitle,
    points: input.points,
  };
  const definerUserId = await requiredTestUserIdForTeam({
    teamId: objective.teamId,
    preferredUserId: objective.createdBy ?? objective.updatedBy,
    purpose: "管理员结算战利品前置指标",
  });

  await db.insert(results).values({
    id: result.id,
    teamId: objective.teamId,
    objectiveId: objective.id,
    title: input.resultTitle,
    detail: testResultDetail(input.metricName, "用于管理员结算已验收战利品测试。"),
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
    definerUserId,
    uncertaintyScore: input.points,
    acceptedResult: "completed",
    reviewCadence: "Weekly",
    createdAt: today(),
    updatedAt: today(),
    createdBy: definerUserId,
    updatedBy: definerUserId,
    sortOrder: 0,
  });

  return result;
}

export async function createSettleLoot(
  target: SettleLootTarget,
  result: SettleLootResult,
  input: Pick<AdminSettleLootCaseData, "lootBody" | "evidenceText" | "memberName">,
): Promise<SettleLoot> {
  const objective = await readObjective(target.objective.id);
  if (!objective) {
    throw new Error("目标不存在，无法创建结算前置战利品");
  }
  const memberUserId = await requiredTestUserIdByNameInTeam({
    teamId: objective.teamId,
    name: input.memberName,
  });
  const loot: SettleLoot = {
    id: `loot-${objective.id}`,
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
    submittedByUserId: memberUserId,
    body: input.lootBody,
    resultClaims: loot.resultClaims,
    selfTestReportUrl: null,
    selfTestReportBody: null,
    submittedAt: new Date().toISOString(),
  });

  return loot;
}

export async function deleteSettleLootResult(title: string, result?: SettleLootResult | null) {
  if (result?.id) {
    await db.delete(results).where(eq(results.id, result.id));
  }
  await db.delete(results).where(eq(results.title, title));
}

export async function deleteSettleLoot(body: string, loot?: SettleLoot | null) {
  if (loot?.id) {
    await db.delete(objectiveLoot).where(eq(objectiveLoot.id, loot.id));
  }
  await db.delete(objectiveLoot).where(eq(objectiveLoot.body, body));
}

export async function deleteSettleLootLedger(objectiveId: string, reason: string) {
  await db
    .delete(pointLedger)
    .where(and(eq(pointLedger.objectiveId, objectiveId), eq(pointLedger.reason, reason)));
}

export async function testSettleLootResultAbsent(title: string) {
  return (await readResultByTitle(title)) === null;
}

export async function testSettleLootAbsent(body: string) {
  return (await readLootByBody(body)) === null;
}

export async function testSettleLootLedgerAbsent(objectiveId: string, reason: string) {
  return (await readLedger(objectiveId, reason)) === null;
}

export async function settleLootTargetAccepted(target: SettleLootTarget, memberName: string, points: number) {
  const objective = await readObjective(target.objective.id);
  const memberUserId = objective
    ? await readTestUserIdByNameInTeam({ teamId: objective.teamId, name: memberName })
    : null;
  return (
    !!objective &&
    objective.flowStatus === "accepted" &&
    objective.stage === "goalFrozen" &&
    objective.acceptedResult === "completed" &&
    objective.objectiveBasePoints === points &&
    objective.objectiveSettlementPoints === null &&
    !!objective.lootSubmittedAt &&
    !!memberUserId &&
    objective.challengers.length === 1 &&
    objective.challengers[0] === memberName &&
    objective.challengerUserIds.length === 1 &&
    objective.challengerUserIds[0] === memberUserId
  );
}

export async function settleLootTargetSettled(target: SettleLootTarget, points: number) {
  const objective = await readObjective(target.objective.id);
  return (
    !!objective &&
    objective.flowStatus === "settled" &&
    objective.stage === "goalFrozen" &&
    objective.acceptedResult === "completed" &&
    objective.objectiveBasePoints === points &&
    objective.objectiveSettlementPoints === points
  );
}

export async function settleLootResultPresent(
  target: SettleLootTarget,
  result: SettleLootResult,
  points: number,
) {
  const row = await readResultByTitle(result.title);
  return (
    !!row &&
    row.id === result.id &&
    row.objectiveId === target.objective.id &&
    row.uncertaintyScore === points &&
    row.acceptedResult === "completed"
  );
}

export async function settleLootPresent(
  target: SettleLootTarget,
  loot: SettleLoot,
  result: SettleLootResult,
) {
  const row = await readLootByBody(loot.body);
  return (
    !!row &&
    row.id === loot.id &&
    row.objectiveId === target.objective.id &&
    row.submittedBy === loot.submittedBy &&
    row.resultClaims.some((claim) => claim.resultId === result.id && claim.claim === "completed")
  );
}

export async function settleLootLedgerPresent(
  target: SettleLootTarget,
  memberName: string,
  points: number,
  reason: string,
) {
  const [row] = await db
    .select({ points: pointLedger.points, reason: pointLedger.reason })
    .from(pointLedger)
    .where(
      and(
        eq(pointLedger.objectiveId, target.objective.id),
        eq(pointLedger.memberName, memberName),
      ),
    )
    .limit(1);

  return !!row && row.points === points && row.reason === reason;
}

export function lootPagePath(target: SettleLootTarget) {
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

async function readLedger(objectiveId: string, reason: string) {
  const [row] = await db
    .select({ id: pointLedger.id })
    .from(pointLedger)
    .where(and(eq(pointLedger.objectiveId, objectiveId), eq(pointLedger.reason, reason)))
    .limit(1);
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
      challengerUserIds: objectives.challengerUserIds,
      lootSubmittedAt: objectives.lootSubmittedAt,
      acceptedResult: objectives.acceptedResult,
      objectiveBasePoints: objectives.objectiveBasePoints,
      objectiveSettlementPoints: objectives.objectiveSettlementPoints,
      createdBy: objectives.createdBy,
      updatedBy: objectives.updatedBy,
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
