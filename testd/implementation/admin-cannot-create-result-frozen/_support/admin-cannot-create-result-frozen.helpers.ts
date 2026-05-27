import type { Page } from "@playwright/test";
import { and, eq, sql } from "drizzle-orm";
import { closeDb, db } from "../../../../server/db/client";
import { objectives, results, teamMembers, users } from "../../../../server/db/schema";
import type {
  FrozenAdminCreateResultCaseData,
  FrozenAdminResultTarget,
  RejectedResultCreateResponse,
} from "./admin-cannot-create-result-frozen.context";

export async function closeFrozenAdminCreateResultTestDb() {
  await closeDb();
}

export async function adminAccountActive(email: string) {
  const account = await readAdminAccount(email);
  return !!account && account.role === "admin" && account.status === "active";
}

export async function frozenAdminResultTargetAvailable(data: Pick<FrozenAdminCreateResultCaseData, "email">) {
  return (await selectFrozenAdminResultTarget(data)) !== null;
}

export async function selectFrozenAdminResultTarget(data: Pick<FrozenAdminCreateResultCaseData, "email">): Promise<FrozenAdminResultTarget | null> {
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
      updatedAt: selected.updatedAt,
      updatedBy: selected.updatedBy,
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
      confirmedAt: new Date().toISOString(),
      updatedAt: today(),
    })
    .where(eq(objectives.id, target.objective.id));
}

export async function restoreFrozenAdminResultTarget(target: FrozenAdminResultTarget | null) {
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

export async function submitManagerDefinedResult(
  page: Page,
  target: FrozenAdminResultTarget,
  input: Pick<FrozenAdminCreateResultCaseData, "resultTitle" | "metricName">,
): Promise<RejectedResultCreateResponse> {
  return page.evaluate(
    async ({ objectiveId, title, metricName }) => {
      const response = await fetch("/api/results", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          objectiveId,
          title,
          metricName,
          source: "managerDefined",
        }),
      });
      const contentType = response.headers.get("content-type") ?? "";
      const body = contentType.includes("application/json")
        ? await response.json().catch(() => null)
        : await response.text().catch(() => null);
      return {
        ok: response.ok,
        status: response.status,
        body,
      };
    },
    {
      objectiveId: target.objective.id,
      title: input.resultTitle,
      metricName: input.metricName,
    },
  );
}

export function objectivePanel(page: Page, target: FrozenAdminResultTarget) {
  return page
    .locator("section.orf-objective-panel")
    .filter({
      has: page.locator(".orf-objective-title").filter({ hasText: new RegExp(`^${escapeRegExp(target.objective.title)}$`) }),
    })
    .first();
}

export function addMetricButton(page: Page, target: FrozenAdminResultTarget) {
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
      stage: objectives.stage,
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

function today() {
  return new Date().toISOString().slice(0, 10);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
