import type { Page } from "@playwright/test";
import { and, eq, sql } from "drizzle-orm";
import { closeDb, db } from "../../../../server/db/client";
import { notifications, objectiveLoot, objectives, results, teamMembers, users } from "../../../../server/db/schema";
import type {
  LootPrerequisiteResult,
  LootTarget,
  MemberSubmitLootCaseData,
  SubmittedLoot,
} from "./member-submit-loot.context";

export async function closeMemberSubmitLootTestDb() {
  await closeDb();
}

export async function memberAccountActive(email: string) {
  const account = await readMemberAccount(email);
  return !!account && account.role === "member" && account.status === "active";
}

export async function lootTargetAvailable(data: Pick<MemberSubmitLootCaseData, "email">) {
  return (await selectLootTarget(data)) !== null;
}

export async function selectLootTarget(data: Pick<MemberSubmitLootCaseData, "email">): Promise<LootTarget | null> {
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
      objectiveSettlementPoints: objectives.objectiveSettlementPoints,
      updatedAt: objectives.updatedAt,
      updatedBy: objectives.updatedBy,
    })
    .from(objectives)
    .where(eq(objectives.teamId, member.teamId));

  const resultRows = await db.select({ objectiveId: results.objectiveId }).from(results);
  const resultCountByObjective = new Map<string, number>();
  for (const row of resultRows) {
    resultCountByObjective.set(row.objectiveId, (resultCountByObjective.get(row.objectiveId) ?? 0) + 1);
  }

  const titleCounts = new Map<string, number>();
  for (const row of objectiveRows) {
    titleCounts.set(row.title, (titleCounts.get(row.title) ?? 0) + 1);
  }

  const selected = objectiveRows.find((row) => {
    if (titleCounts.get(row.title) !== 1) return false;
    if ((resultCountByObjective.get(row.id) ?? 0) !== 0) return false;
    if (row.lootSubmittedAt || row.acceptedResult || row.objectiveSettlementPoints != null) return false;
    if (row.flowStatus === "submitted" || row.flowStatus === "settled" || row.flowStatus === "closed") return false;
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
      objectiveSettlementPoints: selected.objectiveSettlementPoints,
      updatedAt: selected.updatedAt,
      updatedBy: selected.updatedBy,
    },
  };
}

export async function prepareLootTarget(target: LootTarget, memberName: string) {
  const objective = await readObjective(target.objective.id);
  if (!objective) {
    throw new Error("目标不存在，无法准备成员提交战利品状态");
  }

  await db
    .update(objectives)
    .set({
      stage: "goalFrozen",
      flowStatus: "frozen",
      challengers: uniqueMembers([...objective.challengers, memberName]),
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

  const id = `res-testd-loot-${Date.now()}`;
  await db.insert(results).values({
    id,
    teamId: objective.teamId,
    objectiveId: objective.id,
    title: input.resultTitle,
    description: "用于成员提交战利品测试的前置指标。",
    metricName: input.metricName,
    metricRequirement: `${input.metricName}：用于成员提交战利品测试。`,
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
    uncertaintyScore: 30,
    acceptedResult: "unreviewed",
    reviewCadence: "Weekly",
    sortOrder: 0,
  });

  return {
    id,
    objectiveId: objective.id,
    title: input.resultTitle,
    metricName: input.metricName,
  };
}

export async function restoreLootTarget(target: LootTarget | null) {
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
      objectiveSettlementPoints: target.previous.objectiveSettlementPoints,
      updatedAt: target.previous.updatedAt,
      updatedBy: target.previous.updatedBy,
    })
    .where(eq(objectives.id, target.objective.id));
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
  await db.delete(objectiveLoot).where(eq(objectiveLoot.body, body));
}

export async function targetFrozenForMember(target: LootTarget, memberName: string) {
  const objective = await readObjective(target.objective.id);
  return !!objective && objective.flowStatus === "frozen" && objective.stage === "goalFrozen" && objective.challengers.includes(memberName);
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
  return !!row && row.id === result.id && row.metricName === result.metricName;
}

export async function targetLootPresent(target: LootTarget, expected: Pick<MemberSubmitLootCaseData, "lootBody" | "selfTestReportBody">) {
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
  return `/objectives/${encodeURIComponent(target.objective.id)}/loot`;
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
      metricName: results.metricName,
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

function uniqueMembers(members: string[]) {
  return Array.from(new Set(members.map((member) => member.trim()).filter(Boolean)));
}

function today() {
  return new Date().toISOString().slice(0, 10);
}
