import { and, eq, sql } from "drizzle-orm";
import { db } from "../../../../server/db/client";
import { objectives, pointLedger } from "../../../../server/db/schema";
import type { ScoreLedgerInput, ScoreStatisticsTarget } from "./member-score-statistics.context";

export async function scoreStatisticsTargetFromObjective(objectiveId: string): Promise<ScoreStatisticsTarget> {
  const selected = await readObjective(objectiveId);
  if (!selected) {
    throw new Error(`成员分数统计目标不存在: ${objectiveId}`);
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

  await db.insert(pointLedger).values(
    ledgers.map((ledger, index) => ({
      id: `points-testd-member-score-statistics-${index}`,
      teamId: objective.teamId,
      objectiveId: objective.id,
      userId: ledger.userId,
      memberName: ledger.memberName,
      points: ledger.points,
      reason,
      createdAt: new Date().toISOString(),
    })),
  );
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
      title: objectives.title,
      stage: objectives.stage,
      flowStatus: objectives.flowStatus,
    })
    .from(objectives)
    .where(eq(objectives.id, objectiveId))
    .limit(1);

  return row ?? null;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}
