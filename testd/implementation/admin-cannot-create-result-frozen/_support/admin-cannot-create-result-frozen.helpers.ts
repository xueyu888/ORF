import type { Page } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { db } from "../../../../server/db/client";
import { objectives, results } from "../../../../server/db/schema";
import type { FrozenAdminResultTarget } from "./admin-cannot-create-result-frozen.context";

export async function frozenAdminResultTargetFromObjective(objectiveId: string): Promise<FrozenAdminResultTarget> {
  const selected = await readObjective(objectiveId);
  if (!selected) {
    throw new Error(`实施阶段管理员新增指标限制目标不存在: ${objectiveId}`);
  }
  return {
    objective: {
      id: selected.id,
      title: selected.title,
      flowStatus: selected.flowStatus,
    },
  };
}

export async function prepareFrozenAdminResultTarget(target: FrozenAdminResultTarget) {
  const objective = await readObjective(target.objective.id);
  if (!objective) {
    throw new Error("目标不存在，无法准备实施阶段管理员新增指标限制状态");
  }

  await db
    .update(objectives)
    .set({
      stage: "goalFrozen",
      flowStatus: "frozen",
      confirmationDueAt: null,
      confirmedAt: objective.confirmedAt ?? new Date().toISOString(),
      updatedAt: today(),
    })
    .where(eq(objectives.id, target.objective.id));
}

export async function targetFrozen(target: FrozenAdminResultTarget) {
  const objective = await readObjective(target.objective.id);
  return !!objective && objective.flowStatus === "frozen" && objective.stage === "goalFrozen";
}

export async function testResultAbsent(title: string) {
  return (await readResultByTitle(title)) === null;
}

export async function targetResultAbsent(target: FrozenAdminResultTarget, title: string) {
  return (await readTargetResult(target.objective.id, title)) === null;
}

export async function deleteTestResult(title: string) {
  await db.delete(results).where(eq(results.title, title));
}

export function objectivePanel(page: Page, target: FrozenAdminResultTarget) {
  return page
    .locator("section.orf-objective-panel")
    .filter({
      has: page.locator(".orf-objective-title").filter({ hasText: new RegExp(`^${escapeRegExp(target.objective.title)}$`) }),
    })
    .first();
}

export function targetAddMenuButton(page: Page, target: FrozenAdminResultTarget) {
  return objectivePanel(page, target).getByRole("button", { name: "新增子级" }).first();
}

export function targetActionMenuItem(page: Page, target: FrozenAdminResultTarget) {
  return objectivePanel(page, target).getByRole("button", { name: "新增行动项" }).first();
}

export function targetMetricButton(page: Page, target: FrozenAdminResultTarget) {
  return objectivePanel(page, target).getByRole("button", { name: "新增指标" });
}

export function targetResultRow(page: Page, target: FrozenAdminResultTarget, title: string) {
  return objectivePanel(page, target).locator(".orf-result-row").filter({ hasText: title });
}

async function readTargetResult(objectiveId: string, title: string) {
  const [row] = await db
    .select({
      id: results.id,
      objectiveId: results.objectiveId,
      title: results.title,
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

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
