import { expect, type Page } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { db } from "../../../_operators/testd-db-client";
import { objectives, results } from "../../../../server/db/schema";
import type { ObjectiveFlowStatus, OrfStage } from "../../../../src/types/orf";
import { resultDetailIncludesMetricName, testResultDetail } from "../../../_operators/result-detail.helpers";
import {
  deleteTestObjectives,
  requiredTestUserIdForTeam,
  testObjectiveAbsent,
  upsertTestObjective,
} from "../../../_operators/common.helpers";
import type { LootPrerequisiteResult, LootTarget } from "./member-submit-loot.context";
import {
  deleteTestLoot,
  deleteLootPrerequisiteResult,
  lootTargetFromObjective,
  testLootAbsent,
  testResultAbsent,
} from "./member-submit-loot.helpers";

export type LootForbiddenTargetFixture = {
  id: string;
  title: string;
  stage: OrfStage;
  flowStatus: ObjectiveFlowStatus;
  confirmedAt: "present" | "absent";
};

export type LootForbiddenResultFixture = {
  title: string;
  metricName: string;
};

export async function upsertLootForbiddenTarget(input: {
  fixture: LootForbiddenTargetFixture;
  teamId: string;
  challengers: string[];
  createdBy?: string;
  updatedBy?: string;
}) {
  await upsertTestObjective({
    id: input.fixture.id,
    title: input.fixture.title,
    teamId: input.teamId,
    stage: input.fixture.stage,
    flowStatus: input.fixture.flowStatus,
    status: "Draft",
    challengers: uniqueMembers(input.challengers),
    createdBy: input.createdBy,
    updatedBy: input.updatedBy,
  });

  await db
    .update(objectives)
    .set({
      challengers: uniqueMembers(input.challengers),
      confirmedAt: input.fixture.confirmedAt === "present" ? nowIso() : null,
      confirmationDueAt: null,
      lootSubmittedAt: null,
      acceptedResult: null,
      objectiveSettlementPoints: null,
      updatedAt: today(),
    })
    .where(eq(objectives.id, input.fixture.id));

  return lootTargetFromObjective(input.fixture.id);
}

export async function createLootForbiddenResult(
  target: LootTarget,
  fixture: LootForbiddenResultFixture,
): Promise<LootPrerequisiteResult> {
  const objective = await readObjective(target.objective.id);
  if (!objective) {
    throw new Error("目标不存在，无法创建战利品反向用例前置指标");
  }

  const id = `res-testd-loot-forbidden-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const siblingRows = await db.select({ sortOrder: results.sortOrder }).from(results).where(eq(results.objectiveId, objective.id));
  const sortOrder = siblingRows.reduce((max, row) => Math.max(max, row.sortOrder), -1) + 1;
  const definerUserId = await requiredTestUserIdForTeam({
    teamId: objective.teamId,
    preferredUserId: objective.createdBy ?? objective.updatedBy,
    purpose: "成员提交战利品反向用例前置指标",
  });

  await db.insert(results).values({
    id,
    teamId: objective.teamId,
    objectiveId: objective.id,
    title: fixture.title,
    detail: testResultDetail(fixture.metricName, "用于成员提交战利品反向测试。"),
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
    sortOrder,
  });

  return {
    id,
    objectiveId: objective.id,
    title: fixture.title,
    metricName: fixture.metricName,
  };
}

export async function deleteLootForbiddenTargets(fixtures: readonly LootForbiddenTargetFixture[]) {
  for (const fixture of fixtures) {
    await deleteTestObjectives({ id: fixture.id, title: fixture.title });
  }
}

export async function deleteLootForbiddenResults(fixtures: readonly LootForbiddenResultFixture[]) {
  for (const fixture of fixtures) {
    await deleteLootPrerequisiteResult(fixture.title);
  }
}

export async function lootForbiddenTargetsAbsent(fixtures: readonly LootForbiddenTargetFixture[]) {
  for (const fixture of fixtures) {
    if (!(await testObjectiveAbsent({ id: fixture.id, title: fixture.title }))) {
      return false;
    }
  }
  return true;
}

export async function lootForbiddenResultsAbsent(fixtures: readonly LootForbiddenResultFixture[]) {
  for (const fixture of fixtures) {
    if (!(await testResultAbsent(fixture.title))) {
      return false;
    }
  }
  return true;
}

export async function lootForbiddenTargetMatchesFixture(
  fixture: LootForbiddenTargetFixture,
  challengers?: readonly string[],
) {
  const objective = await readObjective(fixture.id);
  if (!objective) {
    return false;
  }

  const confirmedAtMatches = fixture.confirmedAt === "present" ? Boolean(objective.confirmedAt) : !objective.confirmedAt;
  const challengersMatch = challengers
    ? sameMembers(objective.challengers, challengers)
    : true;
  return (
    objective.stage === fixture.stage &&
    objective.flowStatus === fixture.flowStatus &&
    confirmedAtMatches &&
    !objective.lootSubmittedAt &&
    challengersMatch
  );
}

export async function lootForbiddenTargetsMatchFixtures(
  fixtures: readonly LootForbiddenTargetFixture[],
  challengersByTargetId: ReadonlyMap<string, readonly string[]>,
) {
  for (const fixture of fixtures) {
    if (!(await lootForbiddenTargetMatchesFixture(fixture, challengersByTargetId.get(fixture.id)))) {
      return false;
    }
  }
  return true;
}

export async function lootForbiddenResultPresent(target: LootTarget, result: LootPrerequisiteResult) {
  const row = await readTargetResult(target.objective.id, result.title);
  return !!row && row.id === result.id && resultDetailIncludesMetricName(row.detail, result.metricName);
}

export async function lootForbiddenResultsPresent(items: ReadonlyArray<{
  target: LootTarget;
  result: LootPrerequisiteResult;
}>) {
  for (const item of items) {
    if (!(await lootForbiddenResultPresent(item.target, item.result))) {
      return false;
    }
  }
  return true;
}

export async function expectLootForbiddenTargetPanelsVisible(
  page: Page,
  fixtures: readonly LootForbiddenTargetFixture[],
) {
  for (const fixture of fixtures) {
    await expect(objectivePanel(page, fixture)).toBeVisible();
  }
}

export async function expectLootForbiddenTargetPanelsAbsent(
  page: Page,
  fixtures: readonly LootForbiddenTargetFixture[],
) {
  for (const fixture of fixtures) {
    await expect(objectivePanel(page, fixture)).toHaveCount(0);
  }
}

export async function expectSubmitLootActionsAbsent(
  page: Page,
  fixtures: readonly LootForbiddenTargetFixture[],
) {
  for (const fixture of fixtures) {
    await expect(submitLootAction(page, fixture)).toHaveCount(0);
  }
}

export async function workbenchContainsLootForbiddenTargets(
  page: Page,
  input: {
    fixtures: readonly LootForbiddenTargetFixture[];
    scope: "mine" | "all";
  },
) {
  const response = await page.evaluate(async (scope) => {
    const result = await fetch(`/api/my-challenges?scope=${encodeURIComponent(scope)}`, {
      credentials: "include",
    });
    return {
      status: result.status,
      body: await result.json().catch(() => ({})),
    };
  }, input.scope);

  if (response.status !== 200) {
    return false;
  }

  const objectivesValue = typeof response.body === "object" && response.body !== null
    ? (response.body as { objectives?: unknown }).objectives
    : undefined;
  const rows = Array.isArray(objectivesValue) ? objectivesValue : [];
  return input.fixtures.every((fixture) =>
    rows.some((item) => {
      if (typeof item !== "object" || item === null) {
        return false;
      }
      const objective = item as { id?: unknown; title?: unknown };
      return objective.id === fixture.id || objective.title === fixture.title;
    }),
  );
}

export async function workbenchExcludesLootForbiddenTargets(
  page: Page,
  input: {
    fixtures: readonly LootForbiddenTargetFixture[];
    scope: "mine" | "all";
  },
) {
  return !(await workbenchContainsLootForbiddenTargets(page, input));
}

export {
  deleteTestLoot,
  testLootAbsent,
};

function objectivePanel(page: Page, fixture: LootForbiddenTargetFixture) {
  return page.locator("section.orf-objective-panel").filter({ hasText: fixture.title }).first();
}

function submitLootAction(page: Page, fixture: LootForbiddenTargetFixture) {
  return objectivePanel(page, fixture).getByRole("link", { name: "提交战利品" }).first();
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

async function readObjective(objectiveId: string) {
  const [row] = await db
    .select({
      id: objectives.id,
      teamId: objectives.teamId,
      stage: objectives.stage,
      flowStatus: objectives.flowStatus,
      challengers: objectives.challengers,
      confirmedAt: objectives.confirmedAt,
      lootSubmittedAt: objectives.lootSubmittedAt,
      createdBy: objectives.createdBy,
      updatedBy: objectives.updatedBy,
    })
    .from(objectives)
    .where(eq(objectives.id, objectiveId))
    .limit(1);

  return row ?? null;
}

function sameMembers(left: readonly string[], right: readonly string[]) {
  const normalize = (items: readonly string[]) => [...new Set(items.map((item) => item.trim()).filter(Boolean))].sort();
  const leftItems = normalize(left);
  const rightItems = normalize(right);
  return leftItems.length === rightItems.length && leftItems.every((item, index) => item === rightItems[index]);
}

function uniqueMembers(members: readonly string[]) {
  return Array.from(new Set(members.map((member) => member.trim()).filter(Boolean)));
}

function nowIso() {
  return new Date().toISOString();
}

function today() {
  return new Date().toISOString().slice(0, 10);
}
