import type { Page } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { db } from "../../../../server/db/client";
import { objectives, results } from "../../../../server/db/schema";
import type {
  FrozenMemberProposalCaseData,
  FrozenProposalTarget,
  RejectedResultCreateResponse,
} from "./member-cannot-propose-result-frozen.context";

export async function frozenProposalTargetFromObjective(objectiveId: string): Promise<FrozenProposalTarget> {
  const selected = await readObjective(objectiveId);
  if (!selected) {
    throw new Error(`实施阶段成员提出指标限制目标不存在: ${objectiveId}`);
  }
  return {
    objective: {
      id: selected.id,
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

  await db
    .update(objectives)
    .set({
      stage: "goalFrozen",
      flowStatus: "frozen",
      challengers: uniqueMembers([...objective.challengers, memberName]),
      confirmationDueAt: null,
      confirmedAt: new Date().toISOString(),
      updatedAt: today(),
    })
    .where(eq(objectives.id, target.objective.id));
}

export async function targetFrozenForMember(target: FrozenProposalTarget, memberName: string) {
  const objective = await readObjective(target.objective.id);
  return !!objective && objective.flowStatus === "frozen" && objective.stage === "goalFrozen" && objective.challengers.includes(memberName);
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

export async function submitMemberProposedResult(
  page: Page,
  target: FrozenProposalTarget,
  input: Pick<FrozenMemberProposalCaseData, "resultTitle" | "metricName">,
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
          source: "memberProposed",
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

export function objectivePanel(page: Page, target: FrozenProposalTarget) {
  return page.locator("section.orf-objective-panel").filter({ hasText: target.objective.title }).first();
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
      title: objectives.title,
      stage: objectives.stage,
      flowStatus: objectives.flowStatus,
      challengers: objectives.challengers,
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
