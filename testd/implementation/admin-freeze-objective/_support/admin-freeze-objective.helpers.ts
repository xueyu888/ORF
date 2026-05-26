import type { Page } from "@playwright/test";
import { and, eq, sql } from "drizzle-orm";
import { closeDb, db } from "../../../../server/db/client";
import { objectives, results, teamMembers, users } from "../../../../server/db/schema";
import type {
  AdminFreezeObjectiveCaseData,
  AdminFreezeObjectiveTarget,
  FreezePrerequisiteResult,
  FrozenObjective,
} from "./admin-freeze-objective.context";

export async function closeAdminFreezeObjectiveTestDb() {
  await closeDb();
}

export async function adminAccountActive(email: string) {
  const account = await readAdminAccount(email);
  return !!account && account.role === "admin" && account.status === "active";
}

export async function freezeTargetAvailable(data: Pick<AdminFreezeObjectiveCaseData, "email">) {
  return (await selectFreezeTarget(data)) !== null;
}

export async function selectFreezeTarget(data: Pick<AdminFreezeObjectiveCaseData, "email">): Promise<AdminFreezeObjectiveTarget | null> {
  const admin = await readAdminAccount(data.email);
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
      objectiveSettlementPoints: objectives.objectiveSettlementPoints,
      updatedAt: objectives.updatedAt,
      updatedBy: objectives.updatedBy,
    })
    .from(objectives)
    .where(eq(objectives.teamId, admin.teamId));

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
    if (row.flowStatus === "frozen" || row.flowStatus === "submitted" || row.flowStatus === "settled" || row.flowStatus === "closed") return false;
    if ((row.challengeApplications ?? []).some((application) => application.status === "pending")) return false;
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
      updatedAt: selected.updatedAt,
      updatedBy: selected.updatedBy,
    },
  };
}

export async function prepareFreezeTarget(target: AdminFreezeObjectiveTarget) {
  const objective = await readObjective(target.objective.id);
  if (!objective) {
    throw new Error("目标不存在，无法准备冻结状态");
  }

  await db
    .update(objectives)
    .set({
      stage: "orfReestimate",
      flowStatus: "reestimating",
      confirmedAt: null,
      updatedAt: today(),
    })
    .where(eq(objectives.id, target.objective.id));
}

export async function createFreezePrerequisiteResult(
  target: AdminFreezeObjectiveTarget,
  input: Pick<AdminFreezeObjectiveCaseData, "freezeResultTitle" | "freezeMetricName">,
): Promise<FreezePrerequisiteResult> {
  const objective = await readObjective(target.objective.id);
  if (!objective) {
    throw new Error("目标不存在，无法创建冻结前置指标");
  }

  const id = `res-testd-freeze-${Date.now()}`;
  const siblingRows = await db.select({ sortOrder: results.sortOrder }).from(results).where(eq(results.objectiveId, objective.id));
  const sortOrder = siblingRows.reduce((max, row) => Math.max(max, row.sortOrder), -1) + 1;

  await db.insert(results).values({
    id,
    teamId: objective.teamId,
    objectiveId: objective.id,
    title: input.freezeResultTitle,
    description: "用于管理员冻结目标测试的前置指标。",
    metricName: input.freezeMetricName,
    metricRequirement: `${input.freezeMetricName}：用于冻结目标测试。`,
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
    sortOrder,
  });

  return {
    id,
    objectiveId: objective.id,
    title: input.freezeResultTitle,
    metricName: input.freezeMetricName,
  };
}

export async function restoreFreezeTarget(target: AdminFreezeObjectiveTarget | null) {
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
      updatedAt: target.previous.updatedAt,
      updatedBy: target.previous.updatedBy,
    })
    .where(eq(objectives.id, target.objective.id));
}

export async function deleteFreezePrerequisiteResult(title: string, result?: FreezePrerequisiteResult | null) {
  if (result?.id) {
    await db.delete(results).where(eq(results.id, result.id));
  }
  await db.delete(results).where(eq(results.title, title));
}

export async function testResultAbsent(title: string) {
  return (await readResultByTitle(title)) === null;
}

export async function targetResultPresent(target: AdminFreezeObjectiveTarget, result: FreezePrerequisiteResult) {
  const row = await readTargetResult(target.objective.id, result.title);
  return !!row && row.id === result.id && row.metricName === result.metricName;
}

export async function targetReestimating(target: AdminFreezeObjectiveTarget) {
  const objective = await readObjective(target.objective.id);
  return !!objective && objective.flowStatus === "reestimating";
}

export async function targetFrozen(target: AdminFreezeObjectiveTarget) {
  const objective = await readObjective(target.objective.id);
  return !!objective && objective.flowStatus === "frozen" && objective.stage === "goalFrozen" && !!objective.confirmedAt;
}

export function objectivePanel(page: Page, target: AdminFreezeObjectiveTarget) {
  return page.locator("section.orf-objective-panel").filter({ hasText: target.objective.title }).first();
}

export function freezeButton(page: Page, target: AdminFreezeObjectiveTarget) {
  return objectivePanel(page, target).getByRole("button", { name: "冻结" }).first();
}

export function frozenStatus(page: Page, target: AdminFreezeObjectiveTarget) {
  return objectivePanel(page, target).getByText("已冻结", { exact: true }).first();
}

export function frozenObjectiveFromResponse(body: unknown): FrozenObjective {
  if (
    typeof body !== "object" ||
    body === null ||
    typeof (body as { objective?: unknown }).objective !== "object" ||
    (body as { objective?: unknown }).objective === null
  ) {
    throw new Error("冻结目标接口响应缺少 objective");
  }

  const objective = (body as { objective: Record<string, unknown> }).objective;
  if (
    typeof objective.id !== "string" ||
    typeof objective.title !== "string" ||
    typeof objective.stage !== "string" ||
    typeof objective.flowStatus !== "string"
  ) {
    throw new Error("冻结目标接口响应 objective 结构不完整");
  }

  return {
    id: objective.id,
    title: objective.title,
    stage: objective.stage as FrozenObjective["stage"],
    flowStatus: objective.flowStatus as FrozenObjective["flowStatus"],
    confirmedAt: typeof objective.confirmedAt === "string" ? objective.confirmedAt : null,
  };
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

async function readObjective(objectiveId: string) {
  const [row] = await db
    .select({
      id: objectives.id,
      teamId: objectives.teamId,
      stage: objectives.stage,
      flowStatus: objectives.flowStatus,
      confirmedAt: objectives.confirmedAt,
    })
    .from(objectives)
    .where(eq(objectives.id, objectiveId))
    .limit(1);

  return row ?? null;
}

async function readAdminAccount(email: string): Promise<{
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
