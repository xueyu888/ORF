import { and, eq } from "drizzle-orm";
import { db } from "../../../_operators/testd-db-client";
import { objectives, pointLedger } from "../../../../server/db/schema";
import type { FinalScoreLedger, FinalScoreTarget } from "./view-final-score.context";

export async function finalScoreTargetFromObjective(objectiveId: string): Promise<FinalScoreTarget> {
  const selected = await readObjective(objectiveId);
  if (!selected) {
    throw new Error(`最终分数目标不存在: ${objectiveId}`);
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

export async function prepareFinalScoreTarget(target: FinalScoreTarget, memberNames: string[], points: number) {
  await db
    .update(objectives)
    .set({
      stage: "goalFrozen",
      flowStatus: "settled",
      challengers: memberNames,
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
  data: { id: string; memberName: string; points: number; reason: string; userId: string },
): Promise<FinalScoreLedger> {
  const objective = await readObjective(target.objective.id);
  if (!objective) {
    throw new Error("无法创建最终分数测试积分流水");
  }

  const ledger: FinalScoreLedger = {
    id: data.id,
    objectiveId: objective.id,
    memberName: data.memberName,
    points: data.points,
    reason: data.reason,
  };

  await db.insert(pointLedger).values({
    id: ledger.id,
    teamId: objective.teamId,
    objectiveId: objective.id,
    userId: data.userId,
    memberName: data.memberName,
    points: data.points,
    reason: data.reason,
    createdAt: new Date().toISOString(),
  });

  return ledger;
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
  return !!objective && objective.flowStatus === "settled" && objective.challengers.length === 1 && objective.challengers[0] === memberName;
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
      title: objectives.title,
      stage: objectives.stage,
      flowStatus: objectives.flowStatus,
      challengers: objectives.challengers,
    })
    .from(objectives)
    .where(eq(objectives.id, objectiveId))
    .limit(1);

  return row ?? null;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}
