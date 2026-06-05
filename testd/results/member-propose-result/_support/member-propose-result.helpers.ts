import type { Page } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { objectiveChildMenuButton, objectiveChildMenuItem, objectivePanelByTitle } from "../../../_operators/challenge-workbench.helpers";
import { db } from "../../../_operators/testd-db-client";
import { objectives, results } from "../../../../server/db/schema";
import { readTestUserIdByNameInTeam, requiredTestUserIdByNameInTeam } from "../../../_operators/common.helpers";
import type {
  MemberProposeResultCaseData,
  MemberProposeResultTarget,
  MemberProposedResult,
} from "./member-propose-result.context";

export async function proposalTargetFromObjective(objectiveId: string): Promise<MemberProposeResultTarget> {
  const selected = await readObjective(objectiveId);
  if (!selected) {
    throw new Error(`成员提出指标目标不存在: ${objectiveId}`);
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

export async function prepareProposalTarget(target: MemberProposeResultTarget, memberName: string) {
  const objective = await readObjective(target.objective.id);
  if (!objective) {
    throw new Error("目标不存在，无法准备成员提出指标状态");
  }
  const memberUserId = await requiredTestUserIdByNameInTeam({ teamId: objective.teamId, name: memberName });

  await db
    .update(objectives)
    .set({
      stage: "orfReestimate",
      flowStatus: "reestimating",
      challengers: uniqueMembers([...objective.challengers, memberName]),
      challengerUserIds: uniqueMembers([...objective.challengerUserIds, memberUserId]),
      confirmationDueAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: today(),
    })
    .where(eq(objectives.id, target.objective.id));
}

export async function targetCanProposeResult(target: MemberProposeResultTarget, memberName: string) {
  const objective = await readObjective(target.objective.id);
  if (!objective || objective.flowStatus !== "reestimating") return false;
  const memberUserId = await readTestUserIdByNameInTeam({ teamId: objective.teamId, name: memberName });
  if (!memberUserId || !objective.challengerUserIds.includes(memberUserId)) return false;
  if (!objective.confirmationDueAt) return true;
  const dueAt = new Date(objective.confirmationDueAt).getTime();
  return Number.isFinite(dueAt) && Date.now() <= dueAt;
}

export async function testResultAbsent(title: string) {
  return (await readResultByTitle(title)) === null;
}

export async function targetResultAbsent(target: MemberProposeResultTarget, title: string) {
  return (await readTargetResult(target.objective.id, title)) === null;
}

export async function targetResultPresent(
  target: MemberProposeResultTarget,
  expected: Pick<MemberProposeResultCaseData, "name" | "resultTitle">,
) {
  const row = await readTargetResult(target.objective.id, expected.resultTitle);
  return (
    !!row &&
    row.source === "memberProposed" &&
    row.definer === expected.name &&
    row.objectiveId === target.objective.id
  );
}

export async function deleteTestResult(title: string, createdResult?: MemberProposedResult | null) {
  if (createdResult?.id) {
    await db.delete(results).where(eq(results.id, createdResult.id));
  }
  await db.delete(results).where(eq(results.title, title));
}

export function objectivePanel(page: Page, target: MemberProposeResultTarget) {
  return objectivePanelByTitle(page, target.objective.title);
}

export function targetAddMenuButton(page: Page, target: MemberProposeResultTarget) {
  return objectiveChildMenuButton(page, target.objective.title);
}

export function targetMetricMenuItem(page: Page, target: MemberProposeResultTarget) {
  return objectiveChildMenuItem(page, target.objective.title, "提出指标");
}

export function targetResultRow(page: Page, target: MemberProposeResultTarget, result: Pick<MemberProposedResult, "title">) {
  return objectivePanel(page, target).locator(".orf-result-row").filter({ hasText: result.title }).first();
}

export function createdResultFromResponse(body: unknown): MemberProposedResult {
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
    typeof result.detail !== "string"
  ) {
    throw new Error("新增指标接口响应 result 结构不完整");
  }

  return {
    id: result.id,
    objectiveId: result.objectiveId,
    title: result.title,
    detail: result.detail,
    source: typeof result.source === "string" ? (result.source as MemberProposedResult["source"]) : undefined,
    definer: typeof result.definer === "string" ? result.definer : undefined,
  };
}

async function readTargetResult(objectiveId: string, title: string) {
  const [row] = await db
    .select({
      id: results.id,
      objectiveId: results.objectiveId,
      title: results.title,
      detail: results.detail,
      source: results.source,
      definer: results.definer,
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
      flowStatus: objectives.flowStatus,
      challengers: objectives.challengers,
      challengerUserIds: objectives.challengerUserIds,
      confirmationDueAt: objectives.confirmationDueAt,
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
