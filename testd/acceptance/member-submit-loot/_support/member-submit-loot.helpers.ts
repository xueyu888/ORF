import type { Page } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { db } from "../../../_operators/testd-db-client";
import { notifications, objectiveLoot, objectives, results } from "../../../../server/db/schema";
import {
  readTestUserIdByNameInTeam,
  requiredTestUserIdByNameInTeam,
  requiredTestUserIdForTeam,
} from "../../../_operators/common.helpers";
import { resultDetailIncludesMetricName, testResultDetail } from "../../../_operators/result-detail.helpers";
import type {
  LootPrerequisiteResult,
  LootTarget,
  MemberSubmitLootCaseData,
  SubmittedLoot,
} from "./member-submit-loot.context";

export async function lootTargetFromObjective(objectiveId: string): Promise<LootTarget> {
  const selected = await readObjective(objectiveId);
  if (!selected) {
    throw new Error(`成员提交战利品目标不存在: ${objectiveId}`);
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

export async function addLootTargetChallenger(target: LootTarget, memberName: string) {
  const objective = await readObjective(target.objective.id);
  if (!objective) {
    throw new Error("目标不存在，无法设置成员提交战利品挑战者");
  }
  const memberUserId = await requiredTestUserIdByNameInTeam({ teamId: objective.teamId, name: memberName });

  await db
    .update(objectives)
    .set({
      challengers: uniqueMembers([...objective.challengers, memberName]),
      challengerUserIds: uniqueMembers([...objective.challengerUserIds, memberUserId]),
      updatedAt: today(),
    })
    .where(eq(objectives.id, target.objective.id));
}

export async function prepareLootTargetForSubmission(target: LootTarget) {
  const objective = await readObjective(target.objective.id);
  if (!objective) {
    throw new Error("目标不存在，无法准备成员提交战利品状态");
  }

  await db
    .update(objectives)
    .set({
      stage: "goalFrozen",
      flowStatus: "frozen",
      confirmationDueAt: null,
      confirmedAt: new Date().toISOString(),
      lootSubmittedAt: null,
      acceptedResult: null,
      objectiveSettlementPoints: null,
      updatedAt: today(),
    })
    .where(eq(objectives.id, target.objective.id));
}

export async function createLootPrerequisiteResult(
  target: LootTarget,
  input: Pick<MemberSubmitLootCaseData, "resultTitle" | "metricName">,
): Promise<LootPrerequisiteResult> {
  const objective = await readObjective(target.objective.id);
  if (!objective) {
    throw new Error("目标不存在，无法创建战利品前置指标");
  }

  const id = `res-${objective.id}`;
  const definerUserId = await requiredTestUserIdForTeam({
    teamId: objective.teamId,
    preferredUserId: objective.createdBy ?? objective.updatedBy,
    purpose: "成员提交战利品前置指标",
  });

  await db.insert(results).values({
    id,
    teamId: objective.teamId,
    objectiveId: objective.id,
    title: input.resultTitle,
    detail: testResultDetail(input.metricName, "用于成员提交战利品测试。"),
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
    uncertaintyScore: 30,
    acceptedResult: "unreviewed",
    reviewCadence: "Weekly",
    createdAt: today(),
    updatedAt: today(),
    createdBy: definerUserId,
    updatedBy: definerUserId,
    sortOrder: 0,
  });

  return {
    id,
    objectiveId: objective.id,
    title: input.resultTitle,
    metricName: input.metricName,
  };
}

export async function deleteLootPrerequisiteResult(title: string, result?: LootPrerequisiteResult | null) {
  if (result?.id) {
    await db.delete(results).where(eq(results.id, result.id));
  }
  await db.delete(results).where(eq(results.title, title));
}

export async function deleteTestLoot(body: string, loot?: SubmittedLoot | null) {
  if (loot?.id) {
    await db.delete(notifications).where(eq(notifications.targetId, loot.id));
    await db.delete(objectiveLoot).where(eq(objectiveLoot.id, loot.id));
  }

  const rows = await db.select({ id: objectiveLoot.id }).from(objectiveLoot).where(eq(objectiveLoot.body, body));
  for (const row of rows) {
    await db.delete(notifications).where(eq(notifications.targetId, row.id));
  }
  await db.delete(objectiveLoot).where(eq(objectiveLoot.body, body));
}

export async function targetFrozenForMember(target: LootTarget, memberName: string) {
  const objective = await readObjective(target.objective.id);
  const memberUserId = objective ? await readTestUserIdByNameInTeam({ teamId: objective.teamId, name: memberName }) : null;
  return (
    !!objective &&
    objective.flowStatus === "frozen" &&
    objective.stage === "goalFrozen" &&
    !!memberUserId &&
    objective.challengerUserIds.includes(memberUserId)
  );
}

export async function targetSubmitted(target: LootTarget) {
  const objective = await readObjective(target.objective.id);
  return !!objective && objective.flowStatus === "submitted" && !!objective.lootSubmittedAt;
}

export async function testResultAbsent(title: string) {
  return (await readResultByTitle(title)) === null;
}

export async function testLootAbsent(body: string) {
  return (await readLootByBody(body)) === null;
}

export async function targetResultPresent(target: LootTarget, result: LootPrerequisiteResult) {
  const row = await readTargetResult(target.objective.id, result.title);
  return !!row && row.id === result.id && resultDetailIncludesMetricName(row.detail, result.metricName);
}

export async function targetLootPresent(target: LootTarget, expected: { lootBody: string; selfTestReportBody: string }) {
  const row = await readLootByBody(expected.lootBody);
  return !!row && row.objectiveId === target.objective.id && row.selfTestReportBody === expected.selfTestReportBody;
}

export function lootFromResponse(body: unknown): SubmittedLoot {
  if (
    typeof body !== "object" ||
    body === null ||
    typeof (body as { loot?: unknown }).loot !== "object" ||
    (body as { loot?: unknown }).loot === null
  ) {
    throw new Error("提交战利品接口响应缺少 loot");
  }

  const loot = (body as { loot: Record<string, unknown> }).loot;
  if (
    typeof loot.id !== "string" ||
    typeof loot.objectiveId !== "string" ||
    typeof loot.submittedBy !== "string" ||
    typeof loot.body !== "string" ||
    !Array.isArray(loot.resultClaims)
  ) {
    throw new Error("提交战利品接口响应 loot 结构不完整");
  }

  return {
    id: loot.id,
    objectiveId: loot.objectiveId,
    submittedBy: loot.submittedBy,
    body: loot.body,
    resultClaims: loot.resultClaims as SubmittedLoot["resultClaims"],
    selfTestReportBody: typeof loot.selfTestReportBody === "string" ? loot.selfTestReportBody : null,
  };
}

export function lootPagePath(target: LootTarget) {
  return `/tasks/objectives/${encodeURIComponent(target.objective.id)}/loot`;
}

export function claimEvidenceInput(page: Page) {
  return page.getByPlaceholder("证据、数据或链接").first();
}

async function readTargetResult(objectiveId: string, title: string) {
  const [row] = await db
    .select({
      id: results.id,
      objectiveId: results.objectiveId,
      title: results.title,
      detail: results.detail,
    })
    .from(results)
    .where(and(eq(results.objectiveId, objectiveId), eq(results.title, title)))
    .limit(1);

  return row ?? null;
}

async function readResultByTitle(title: string) {
  const [row] = await db.select({ id: results.id }).from(results).where(eq(results.title, title)).limit(1);
  return row ?? null;
}

async function readLootByBody(body: string) {
  const [row] = await db
    .select({
      id: objectiveLoot.id,
      objectiveId: objectiveLoot.objectiveId,
      body: objectiveLoot.body,
      selfTestReportBody: objectiveLoot.selfTestReportBody,
    })
    .from(objectiveLoot)
    .where(eq(objectiveLoot.body, body))
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
      createdBy: objectives.createdBy,
      updatedBy: objectives.updatedBy,
    })
    .from(objectives)
    .where(eq(objectives.id, objectiveId))
    .limit(1);

  return row ?? null;
}

function uniqueMembers(members: string[]) {
  return Array.from(new Set(members.map((member) => member.trim()).filter(Boolean)));
}

function today() {
  return new Date().toISOString().slice(0, 10);
}
