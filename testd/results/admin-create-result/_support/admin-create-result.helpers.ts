import type { Page } from "@playwright/test";
import { and, eq, sql } from "drizzle-orm";
import { closeDb, db } from "../../../../server/db/client";
import { objectives, results, teamMembers, users } from "../../../../server/db/schema";
import type { ObjectiveFlowStatus } from "../../../../src/types/orf";
import type { AdminCreateResultCaseData, AdminCreateResultTarget, AdminCreatedResult } from "./admin-create-result.context";

const resultMutableFlowStatuses = new Set<ObjectiveFlowStatus>(["candidate", "open", "applying", "recruiting", "reestimating"]);

export async function closeAdminCreateResultTestDb() {
  await closeDb();
}

export async function adminAccountActive(email: string) {
  const account = await readAdminAccount(email);
  return !!account && account.role === "admin" && account.status === "active";
}

export async function resultTargetAvailable(data: Pick<AdminCreateResultCaseData, "email">) {
  return (await selectResultTarget(data)) !== null;
}

export async function selectResultTarget(data: Pick<AdminCreateResultCaseData, "email">): Promise<AdminCreateResultTarget | null> {
  const admin = await readAdminAccount(data.email);
  if (!admin) {
    return null;
  }

  const objectiveRows = await db
    .select({
      id: objectives.id,
      title: objectives.title,
      flowStatus: objectives.flowStatus,
    })
    .from(objectives)
    .where(eq(objectives.teamId, admin.teamId));

  const resultRows = await db
    .select({
      objectiveId: results.objectiveId,
    })
    .from(results);

  const resultCountByObjective = new Map<string, number>();
  for (const row of resultRows) {
    resultCountByObjective.set(row.objectiveId, (resultCountByObjective.get(row.objectiveId) ?? 0) + 1);
  }

  const titleCounts = new Map<string, number>();
  for (const row of objectiveRows) {
    titleCounts.set(row.title, (titleCounts.get(row.title) ?? 0) + 1);
  }

  const candidates = objectiveRows.filter((row) => {
    if (!resultMutableFlowStatuses.has(row.flowStatus)) return false;
    if (titleCounts.get(row.title) !== 1) return false;
    return (resultCountByObjective.get(row.id) ?? 0) === 0;
  });

  const selected =
    candidates.find((row) => row.flowStatus === "reestimating") ??
    candidates.find((row) => row.flowStatus === "open") ??
    candidates[0];

  if (!selected) {
    return null;
  }

  return {
    objective: {
      id: selected.id,
      title: selected.title,
      flowStatus: selected.flowStatus,
    },
  };
}

export async function targetCanCreateResult(target: AdminCreateResultTarget) {
  const row = await readObjective(target.objective.id);
  return !!row && resultMutableFlowStatuses.has(row.flowStatus);
}

export async function testResultAbsent(title: string) {
  return (await readResultByTitle(title)) === null;
}

export async function targetResultAbsent(target: AdminCreateResultTarget, title: string) {
  return (await readTargetResult(target.objective.id, title)) === null;
}

export async function targetResultPresent(
  target: AdminCreateResultTarget,
  expected: Pick<AdminCreateResultCaseData, "resultTitle" | "metricName">,
) {
  const row = await readTargetResult(target.objective.id, expected.resultTitle);
  return (
    !!row &&
    row.metricName === expected.metricName &&
    row.source === "managerDefined" &&
    row.objectiveId === target.objective.id
  );
}

export async function deleteTestResult(title: string, createdResult?: AdminCreatedResult | null) {
  if (createdResult?.id) {
    await db.delete(results).where(eq(results.id, createdResult.id));
  }
  await db.delete(results).where(eq(results.title, title));
}

export function objectivePanel(page: Page, target: AdminCreateResultTarget) {
  return page.locator("section.orf-objective-panel").filter({ hasText: target.objective.title }).first();
}

export function targetMetricButton(page: Page, target: AdminCreateResultTarget) {
  return objectivePanel(page, target).getByRole("button", { name: "新增指标" }).first();
}

export function targetResultRow(page: Page, target: AdminCreateResultTarget, result: Pick<AdminCreatedResult, "title">) {
  return objectivePanel(page, target).locator(".orf-result-row").filter({ hasText: result.title }).first();
}

export function createdResultFromResponse(body: unknown): AdminCreatedResult {
  if (
    typeof body !== "object" ||
    body === null ||
    typeof (body as { result?: unknown }).result !== "object" ||
    (body as { result?: unknown }).result === null
  ) {
    throw new Error("新增指标接口响应缺少 result");
  }

  const result = (body as { result: Record<string, unknown> }).result;
  if (
    typeof result.id !== "string" ||
    typeof result.objectiveId !== "string" ||
    typeof result.title !== "string" ||
    typeof result.metricName !== "string"
  ) {
    throw new Error("新增指标接口响应 result 结构不完整");
  }

  return {
    id: result.id,
    objectiveId: result.objectiveId,
    title: result.title,
    metricName: result.metricName,
    source: typeof result.source === "string" ? result.source as AdminCreatedResult["source"] : undefined,
    definer: typeof result.definer === "string" ? result.definer : undefined,
  };
}

async function readTargetResult(objectiveId: string, title: string) {
  const [row] = await db
    .select({
      id: results.id,
      objectiveId: results.objectiveId,
      title: results.title,
      metricName: results.metricName,
      source: results.source,
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
      flowStatus: objectives.flowStatus,
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
