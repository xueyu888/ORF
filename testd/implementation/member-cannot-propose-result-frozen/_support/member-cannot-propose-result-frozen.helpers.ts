import type { Page } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { db } from "../../../_operators/testd-db-client";
import { objectives, results } from "../../../../server/db/schema";
import { readTestUserIdByNameInTeam, requiredTestUserIdByNameInTeam } from "../../../_operators/common.helpers";
import type { FrozenProposalTarget } from "./member-cannot-propose-result-frozen.context";

export async function frozenProposalTargetFromObjective(objectiveId: string): Promise<FrozenProposalTarget> {
  const selected = await readObjective(objectiveId);
  if (!selected) {
    throw new Error(`实施阶段成员提出指标限制目标不存在: ${objectiveId}`);
  }
  return {
    objective: {
      id: selected.id,
      teamId: selected.teamId,
      title: selected.title,
      flowStatus: selected.flowStatus,
    },
  };
}

export async function prepareFrozenProposalTarget(target: FrozenProposalTarget, memberName: string) {
  const objective = await readObjective(target.objective.id);
  if (!objective) {
    throw new Error("目标不存在，无法准备实施阶段成员提出指标限制状态");
  }
  const memberUserId = await requiredTestUserIdByNameInTeam({ teamId: objective.teamId, name: memberName });

  await db
    .update(objectives)
    .set({
      stage: "goalFrozen",
      flowStatus: "frozen",
      challengers: uniqueMembers([...objective.challengers, memberName]),
      challengerUserIds: uniqueMembers([...objective.challengerUserIds, memberUserId]),
      confirmationDueAt: null,
      confirmedAt: new Date().toISOString(),
      updatedAt: today(),
    })
    .where(eq(objectives.id, target.objective.id));
}

export async function targetFrozenForMember(target: FrozenProposalTarget, memberName: string) {
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

export async function testResultAbsent(title: string) {
  return (await readResultByTitle(title)) === null;
}

export async function targetResultAbsent(target: FrozenProposalTarget, title: string) {
  return (await readTargetResult(target.objective.id, title)) === null;
}

export async function deleteTestResult(title: string) {
  await db.delete(results).where(eq(results.title, title));
}

export function objectivePanel(page: Page, target: FrozenProposalTarget) {
  return page.locator("section.orf-objective-panel").filter({ hasText: target.objective.title }).first();
}

export function targetAddMenuButton(page: Page, target: FrozenProposalTarget) {
  return objectivePanel(page, target).getByRole("button", { name: "新增子级" }).first();
}

export function targetActionMenuItem(page: Page, target: FrozenProposalTarget) {
  return objectivePanel(page, target).getByRole("button", { name: "新增行动项" }).first();
}

export function targetMetricButton(page: Page, target: FrozenProposalTarget) {
  return objectivePanel(page, target).getByRole("button", { name: "提出指标" });
}

export function targetResultRow(page: Page, target: FrozenProposalTarget, title: string) {
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
      teamId: objectives.teamId,
      title: objectives.title,
      stage: objectives.stage,
      flowStatus: objectives.flowStatus,
      challengers: objectives.challengers,
      challengerUserIds: objectives.challengerUserIds,
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
