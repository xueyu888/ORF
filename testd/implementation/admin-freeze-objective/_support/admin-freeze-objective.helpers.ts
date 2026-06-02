import type { Page } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { db } from "../../../../server/db/client";
import { objectives, results } from "../../../../server/db/schema";
import type {
  AdminFreezeObjectiveCaseData,
  AdminFreezeObjectiveTarget,
  FreezePrerequisiteResult,
  FrozenObjective,
} from "./admin-freeze-objective.context";

export async function freezeTargetFromObjective(objectiveId: string): Promise<AdminFreezeObjectiveTarget> {
  const selected = await readObjective(objectiveId);
  if (!selected) {
    throw new Error(`管理员冻结目标不存在: ${objectiveId}`);
  }
  return {
    objective: {
      id: selected.id,
      title: selected.title,
      flowStatus: selected.flowStatus,
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

  const id = `res-testd-admin-freeze-${Date.now()}`;
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
  return (
    !!row &&
    row.id === result.id &&
    row.metricName === result.metricName &&
    !!row.uncertaintyLevel &&
    typeof row.uncertaintyScore === "number" &&
    row.uncertaintyScore > 0
  );
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
      uncertaintyLevel: results.uncertaintyLevel,
      uncertaintyScore: results.uncertaintyScore,
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
      title: objectives.title,
      stage: objectives.stage,
      flowStatus: objectives.flowStatus,
      confirmedAt: objectives.confirmedAt,
    })
    .from(objectives)
    .where(eq(objectives.id, objectiveId))
    .limit(1);

  return row ?? null;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}
