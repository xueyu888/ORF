import { expect, type Page } from "@playwright/test";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../../../_operators/testd-db-client";
import { objectiveLoot, objectives, pointLedger, results } from "../../../../server/db/schema";
import type { LootResultClaim, ObjectiveFlowStatus, OrfStage, ResultAcceptedResult } from "../../../../src/types/orf";
import {
  deleteTestObjectives,
  testObjectiveAbsent,
  upsertTestObjective,
} from "../../../_operators/common.helpers";

export type ReviewLootForbiddenTargetFixture = {
  id: string;
  title: string;
  stage: OrfStage;
  flowStatus: ObjectiveFlowStatus;
  lootSubmittedAt: "present" | "absent";
  acceptedResult?: "completed" | "failed" | "absent";
  objectiveBasePoints?: number;
  objectiveSettlementPoints?: number | "absent";
};

export type ReviewLootForbiddenResultFixture = {
  title: string;
  metricName: string;
  points: number;
};

export type ReviewLootForbiddenLootFixture = {
  body: string;
  submittedBy: string;
  evidenceText: string;
};

export type ReviewLootForbiddenTarget = {
  objective: {
    id: string;
    teamId: string;
    title: string;
    stage: OrfStage;
    flowStatus: ObjectiveFlowStatus;
  };
};

export type ReviewLootForbiddenResult = {
  id: string;
  objectiveId: string;
  title: string;
  metricName: string;
  points: number;
  acceptedResult: ResultAcceptedResult;
};

export type ReviewLootForbiddenLoot = {
  id: string;
  objectiveId: string;
  body: string;
  submittedBy: string;
  resultClaims: LootResultClaim[];
};

export async function upsertReviewLootForbiddenTarget(input: {
  fixture: ReviewLootForbiddenTargetFixture;
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
    objectiveBasePoints: input.fixture.objectiveBasePoints ?? 0,
  });

  await db
    .update(objectives)
    .set({
      challengers: uniqueMembers(input.challengers),
      confirmedAt: input.fixture.stage === "goalFrozen" ? nowIso() : null,
      confirmationDueAt: null,
      lootSubmittedAt: input.fixture.lootSubmittedAt === "present" ? nowIso() : null,
      acceptedResult: input.fixture.acceptedResult === "absent" ? null : input.fixture.acceptedResult ?? null,
      completionMultiplier: null,
      objectiveBasePoints: input.fixture.objectiveBasePoints ?? 0,
      objectiveSettlementPoints: input.fixture.objectiveSettlementPoints === "absent" ? null : input.fixture.objectiveSettlementPoints ?? null,
      updatedAt: today(),
    })
    .where(eq(objectives.id, input.fixture.id));

  return reviewLootForbiddenTargetFromObjective(input.fixture.id);
}

export async function reviewLootForbiddenTargetFromObjective(objectiveId: string): Promise<ReviewLootForbiddenTarget> {
  const row = await readObjective(objectiveId);
  if (!row) {
    throw new Error(`验收战利品反向用例目标不存在: ${objectiveId}`);
  }

  return {
    objective: {
      id: row.id,
      teamId: row.teamId,
      title: row.title,
      stage: row.stage,
      flowStatus: row.flowStatus,
    },
  };
}

export async function createReviewLootForbiddenResult(
  target: ReviewLootForbiddenTarget,
  fixture: ReviewLootForbiddenResultFixture,
): Promise<ReviewLootForbiddenResult> {
  const objective = await readObjective(target.objective.id);
  if (!objective) {
    throw new Error("目标不存在，无法创建验收战利品反向用例前置指标");
  }

  const id = `res-testd-review-loot-forbidden-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const siblingRows = await db.select({ sortOrder: results.sortOrder }).from(results).where(eq(results.objectiveId, objective.id));
  const sortOrder = siblingRows.reduce((max, row) => Math.max(max, row.sortOrder), -1) + 1;
  await db.insert(results).values({
    id,
    teamId: objective.teamId,
    objectiveId: objective.id,
    title: fixture.title,
    description: "用于管理员验收战利品反向测试的前置指标。",
    metricName: fixture.metricName,
    metricRequirement: `${fixture.metricName}：用于管理员验收战利品反向测试。`,
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
    uncertaintyScore: fixture.points,
    acceptedResult: "unreviewed",
    reviewCadence: "Weekly",
    createdAt: today(),
    updatedAt: today(),
    sortOrder,
  });

  return {
    id,
    objectiveId: objective.id,
    title: fixture.title,
    metricName: fixture.metricName,
    points: fixture.points,
    acceptedResult: "unreviewed",
  };
}

export async function createReviewLootForbiddenLoot(
  target: ReviewLootForbiddenTarget,
  result: ReviewLootForbiddenResult,
  fixture: ReviewLootForbiddenLootFixture,
): Promise<ReviewLootForbiddenLoot> {
  const objective = await readObjective(target.objective.id);
  if (!objective) {
    throw new Error("目标不存在，无法创建验收战利品反向用例前置战利品");
  }

  const resultClaims = [{ resultId: result.id, claim: "completed" as const, evidenceText: fixture.evidenceText }];
  const id = `loot-testd-review-loot-forbidden-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await db.insert(objectiveLoot).values({
    id,
    teamId: objective.teamId,
    objectiveId: objective.id,
    submittedBy: fixture.submittedBy,
    body: fixture.body,
    resultClaims,
    selfTestReportUrl: null,
    selfTestReportBody: null,
    submittedAt: nowIso(),
  });

  return {
    id,
    objectiveId: objective.id,
    body: fixture.body,
    submittedBy: fixture.submittedBy,
    resultClaims,
  };
}

export async function deleteReviewLootForbiddenTargets(fixtures: readonly ReviewLootForbiddenTargetFixture[]) {
  for (const fixture of fixtures) {
    await deleteTestObjectives({ id: fixture.id, title: fixture.title });
  }
}

export async function deleteReviewLootForbiddenResults(fixtures: readonly ReviewLootForbiddenResultFixture[]) {
  for (const fixture of fixtures) {
    await db.delete(results).where(eq(results.title, fixture.title));
  }
}

export async function deleteReviewLootForbiddenLoots(fixtures: readonly ReviewLootForbiddenLootFixture[]) {
  for (const fixture of fixtures) {
    await db.delete(objectiveLoot).where(eq(objectiveLoot.body, fixture.body));
  }
}

export async function deleteReviewLootForbiddenLedger(reasons: readonly string[]) {
  if (reasons.length === 0) return;
  await db.delete(pointLedger).where(inArray(pointLedger.reason, [...reasons]));
}

export async function reviewLootForbiddenTargetsAbsent(fixtures: readonly ReviewLootForbiddenTargetFixture[]) {
  for (const fixture of fixtures) {
    if (!(await testObjectiveAbsent({ id: fixture.id, title: fixture.title }))) {
      return false;
    }
  }
  return true;
}

export async function reviewLootForbiddenResultsAbsent(fixtures: readonly ReviewLootForbiddenResultFixture[]) {
  for (const fixture of fixtures) {
    if ((await readResultByTitle(fixture.title)) !== null) {
      return false;
    }
  }
  return true;
}

export async function reviewLootForbiddenLootsAbsent(fixtures: readonly ReviewLootForbiddenLootFixture[]) {
  for (const fixture of fixtures) {
    if ((await readLootByBody(fixture.body)) !== null) {
      return false;
    }
  }
  return true;
}

export async function reviewLootForbiddenLedgerAbsent(reasons: readonly string[]) {
  if (reasons.length === 0) return true;
  const rows = await db.select({ id: pointLedger.id }).from(pointLedger).where(inArray(pointLedger.reason, [...reasons]));
  return rows.length === 0;
}

export async function reviewLootForbiddenTargetMatchesFixture(
  fixture: ReviewLootForbiddenTargetFixture,
  challengers?: readonly string[],
) {
  const objective = await readObjective(fixture.id);
  if (!objective) {
    return false;
  }

  const expectedAcceptedResult = fixture.acceptedResult === "absent" ? null : fixture.acceptedResult ?? null;
  const expectedSettlementPoints = fixture.objectiveSettlementPoints === "absent" ? null : fixture.objectiveSettlementPoints ?? null;
  const lootSubmittedAtMatches = fixture.lootSubmittedAt === "present" ? Boolean(objective.lootSubmittedAt) : !objective.lootSubmittedAt;
  const challengersMatch = challengers ? sameMembers(objective.challengers, challengers) : true;
  return (
    objective.stage === fixture.stage &&
    objective.flowStatus === fixture.flowStatus &&
    lootSubmittedAtMatches &&
    objective.acceptedResult === expectedAcceptedResult &&
    objective.objectiveBasePoints === (fixture.objectiveBasePoints ?? 0) &&
    objective.objectiveSettlementPoints === expectedSettlementPoints &&
    challengersMatch
  );
}

export async function reviewLootForbiddenTargetsMatchFixtures(
  fixtures: readonly ReviewLootForbiddenTargetFixture[],
  challengersByTargetId: ReadonlyMap<string, readonly string[]>,
) {
  for (const fixture of fixtures) {
    if (!(await reviewLootForbiddenTargetMatchesFixture(fixture, challengersByTargetId.get(fixture.id)))) {
      return false;
    }
  }
  return true;
}

export async function reviewLootForbiddenResultPresent(
  target: ReviewLootForbiddenTarget,
  result: ReviewLootForbiddenResult,
) {
  const row = await readResultByTitle(result.title);
  return (
    !!row &&
    row.id === result.id &&
    row.objectiveId === target.objective.id &&
    row.metricName === result.metricName &&
    row.uncertaintyScore === result.points
  );
}

export async function reviewLootForbiddenResultUnreviewed(result: ReviewLootForbiddenResult) {
  const row = await readResultByTitle(result.title);
  return !!row && row.id === result.id && row.acceptedResult === "unreviewed";
}

export async function reviewLootForbiddenLootPresent(
  target: ReviewLootForbiddenTarget,
  loot: ReviewLootForbiddenLoot,
  result: ReviewLootForbiddenResult,
) {
  const row = await readLootByBody(loot.body);
  return (
    !!row &&
    row.id === loot.id &&
    row.objectiveId === target.objective.id &&
    row.submittedBy === loot.submittedBy &&
    row.resultClaims.some((claim) => claim.resultId === result.id && claim.claim === "completed")
  );
}

export async function reviewLootForbiddenLootsPresent(items: ReadonlyArray<{
  target: ReviewLootForbiddenTarget;
  loot: ReviewLootForbiddenLoot;
  result: ReviewLootForbiddenResult;
}>) {
  for (const item of items) {
    if (!(await reviewLootForbiddenLootPresent(item.target, item.loot, item.result))) {
      return false;
    }
  }
  return true;
}

export async function expectReviewLootForbiddenTargetPanelsVisible(
  page: Page,
  fixtures: readonly ReviewLootForbiddenTargetFixture[],
) {
  for (const fixture of fixtures) {
    await expect(objectivePanel(page, fixture)).toBeVisible();
  }
}

export async function expectReviewLootActionsAbsent(
  page: Page,
  fixtures: readonly ReviewLootForbiddenTargetFixture[],
) {
  for (const fixture of fixtures) {
    await expect(reviewLootAction(page, fixture)).toHaveCount(0);
  }
}

export async function workbenchContainsReviewLootForbiddenTargets(
  page: Page,
  input: {
    fixtures: readonly ReviewLootForbiddenTargetFixture[];
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

export function asReviewLootForbiddenTargetFixture(value: unknown): ReviewLootForbiddenTargetFixture {
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as ReviewLootForbiddenTargetFixture).id !== "string" ||
    typeof (value as ReviewLootForbiddenTargetFixture).title !== "string" ||
    typeof (value as ReviewLootForbiddenTargetFixture).stage !== "string" ||
    typeof (value as ReviewLootForbiddenTargetFixture).flowStatus !== "string" ||
    ((value as ReviewLootForbiddenTargetFixture).lootSubmittedAt !== "present" &&
      (value as ReviewLootForbiddenTargetFixture).lootSubmittedAt !== "absent")
  ) {
    throw new Error("参数必须是验收战利品反向用例目标配置");
  }
  return value as ReviewLootForbiddenTargetFixture;
}

export function asReviewLootForbiddenResultFixture(value: unknown): ReviewLootForbiddenResultFixture {
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as ReviewLootForbiddenResultFixture).title !== "string" ||
    typeof (value as ReviewLootForbiddenResultFixture).metricName !== "string" ||
    typeof (value as ReviewLootForbiddenResultFixture).points !== "number"
  ) {
    throw new Error("参数必须是验收战利品反向用例指标配置");
  }
  return value as ReviewLootForbiddenResultFixture;
}

export function asReviewLootForbiddenLootFixture(value: unknown): ReviewLootForbiddenLootFixture {
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as ReviewLootForbiddenLootFixture).body !== "string" ||
    typeof (value as ReviewLootForbiddenLootFixture).submittedBy !== "string" ||
    typeof (value as ReviewLootForbiddenLootFixture).evidenceText !== "string"
  ) {
    throw new Error("参数必须是验收战利品反向用例战利品配置");
  }
  return value as ReviewLootForbiddenLootFixture;
}

export function asReviewLootForbiddenTarget(value: unknown): ReviewLootForbiddenTarget {
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as ReviewLootForbiddenTarget).objective !== "object" ||
    (value as ReviewLootForbiddenTarget).objective === null ||
    typeof (value as ReviewLootForbiddenTarget).objective.id !== "string" ||
    typeof (value as ReviewLootForbiddenTarget).objective.title !== "string" ||
    typeof (value as ReviewLootForbiddenTarget).objective.flowStatus !== "string"
  ) {
    throw new Error("参数必须是验收战利品反向用例目标");
  }
  return value as ReviewLootForbiddenTarget;
}

export function asReviewLootForbiddenResult(value: unknown): ReviewLootForbiddenResult {
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as ReviewLootForbiddenResult).id !== "string" ||
    typeof (value as ReviewLootForbiddenResult).objectiveId !== "string" ||
    typeof (value as ReviewLootForbiddenResult).title !== "string" ||
    typeof (value as ReviewLootForbiddenResult).metricName !== "string" ||
    typeof (value as ReviewLootForbiddenResult).points !== "number"
  ) {
    throw new Error("参数必须是验收战利品反向用例指标");
  }
  return value as ReviewLootForbiddenResult;
}

export function asReviewLootForbiddenLoot(value: unknown): ReviewLootForbiddenLoot {
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as ReviewLootForbiddenLoot).id !== "string" ||
    typeof (value as ReviewLootForbiddenLoot).objectiveId !== "string" ||
    typeof (value as ReviewLootForbiddenLoot).body !== "string" ||
    typeof (value as ReviewLootForbiddenLoot).submittedBy !== "string" ||
    !Array.isArray((value as ReviewLootForbiddenLoot).resultClaims)
  ) {
    throw new Error("参数必须是验收战利品反向用例战利品");
  }
  return value as ReviewLootForbiddenLoot;
}

function objectivePanel(page: Page, fixture: ReviewLootForbiddenTargetFixture) {
  return page.locator("section.orf-objective-panel").filter({ hasText: fixture.title }).first();
}

function reviewLootAction(page: Page, fixture: ReviewLootForbiddenTargetFixture) {
  return objectivePanel(page, fixture).getByRole("link", { name: "验收战利品" }).first();
}

async function readResultByTitle(title: string) {
  const [row] = await db
    .select({
      id: results.id,
      objectiveId: results.objectiveId,
      title: results.title,
      metricName: results.metricName,
      uncertaintyScore: results.uncertaintyScore,
      acceptedResult: results.acceptedResult,
    })
    .from(results)
    .where(eq(results.title, title))
    .limit(1);
  return row ?? null;
}

async function readLootByBody(body: string) {
  const [row] = await db
    .select({
      id: objectiveLoot.id,
      objectiveId: objectiveLoot.objectiveId,
      submittedBy: objectiveLoot.submittedBy,
      resultClaims: objectiveLoot.resultClaims,
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
      title: objectives.title,
      stage: objectives.stage,
      flowStatus: objectives.flowStatus,
      challengers: objectives.challengers,
      lootSubmittedAt: objectives.lootSubmittedAt,
      acceptedResult: objectives.acceptedResult,
      objectiveBasePoints: objectives.objectiveBasePoints,
      objectiveSettlementPoints: objectives.objectiveSettlementPoints,
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
