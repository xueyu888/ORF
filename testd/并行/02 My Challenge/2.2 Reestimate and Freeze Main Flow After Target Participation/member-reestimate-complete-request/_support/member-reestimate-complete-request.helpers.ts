import { expect, type Page } from "@playwright/test";
import { and, eq, ilike, inArray } from "drizzle-orm";
import { objectiveAlignmentRequests, objectives, results } from "../../../../../../server/db/schema";
import type { ObjectiveAlignmentRequestKind, ObjectiveAlignmentRequestStatus, UncertaintyLevel } from "../../../../../../src/types/orf";
import {
  deleteTestObjective,
  upsertTestObjective,
  type TestObjectiveFixtureRecord,
  type TestUserAccountRecord,
} from "../../../../../_operators/common.helpers";
import { db } from "../../../../../_operators/testd-db-client";
import type {
  MyChallengesApiData,
  ReestimateObjectiveTargetData,
} from "./member-reestimate-complete-request.context";

export async function loginAsMember(page: Page, input: { email: string; password: string }) {
  await page.goto("/auth");
  await page.getByLabel("Email").fill(input.email);
  await page.getByLabel("Password", { exact: true }).fill(input.password);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect.poll(async () => {
    const response = await page.evaluate(async () => {
      const sessionResponse = await fetch("/api/auth/session", { credentials: "include" });
      return {
        status: sessionResponse.status,
        body: await sessionResponse.json(),
      };
    });
    return response.status === 200 && response.body?.authenticated === true;
  }).toBe(true);
}

export async function openMyChallenges(page: Page) {
  await page.goto("/tasks");
  await expect(page).toHaveURL(/\/tasks(?:[?#].*)?$/);
}

export function challengeScopeTab(page: Page, label: string) {
  return page.getByRole("button", { name: label, exact: true });
}

export function objectivePanel(page: Page, title: string) {
  return page.locator(".orf-objective-panel").filter({ hasText: title }).first();
}

export function metricRow(page: Page, title: string) {
  return page.locator(".orf-result-row").filter({ hasText: title }).first();
}

export function toast(page: Page, text: string | RegExp) {
  return page.locator(".orf-toast-card").filter({ hasText: text });
}

export async function readSessionUserName(page: Page) {
  const response = await page.evaluate(async () => {
    const sessionResponse = await fetch("/api/auth/session", { credentials: "include" });
    return {
      status: sessionResponse.status,
      body: await sessionResponse.json().catch(() => ({})),
    };
  });

  if (response.status !== 200 || response.body?.authenticated !== true) {
    return null;
  }

  const name = response.body?.user?.name;
  return typeof name === "string" ? name : null;
}

export async function deleteObjectivesByTitlePrefix(prefix: string) {
  const rows = await db.select({ id: objectives.id }).from(objectives).where(ilike(objectives.title, `${escapeLike(prefix)}%`));
  for (const row of rows) {
    const deleted = await deleteTestObjective(row.id);
    if (!deleted) {
      await db.delete(objectives).where(eq(objectives.id, row.id));
    }
  }
}

export async function objectivePrefixAbsent(prefix: string) {
  const rows = await db.select({ id: objectives.id }).from(objectives).where(ilike(objectives.title, `${escapeLike(prefix)}%`));
  return rows.length === 0;
}

export async function metricAbsentByTitle(title: string) {
  return (await metricByTitle(title)) === null;
}

export async function prepareReestimateObjective(input: {
  memberUser: TestUserAccountRecord;
  target: ReestimateObjectiveTargetData;
}): Promise<TestObjectiveFixtureRecord> {
  const finalDueAt = addDaysIsoDate(14);
  const record = await upsertTestObjective({
    teamId: input.memberUser.teamId,
    title: input.target.title,
    stage: input.target.stage,
    flowStatus: input.target.flowStatus,
    status: "On Track",
    progress: 15,
    finalDueAt,
    challengers: [input.memberUser.name],
    challengerUserIds: [input.memberUser.userId],
    assignedChallengers: [],
    assignedChallengerUserIds: [],
    createdBy: input.memberUser.userId,
    updatedBy: input.memberUser.userId,
  });

  await db
    .update(objectives)
    .set({
      acceptedAt: addHoursIso(-2),
      confirmationDueAt: addHoursIso(24),
      updatedAt: today(),
    })
    .where(eq(objectives.id, record.id));

  return record;
}

export async function objectiveHasStageAndFlowStatus(input: ReestimateObjectiveTargetData) {
  const row = await objectiveByTitle(input.title);
  return row?.stage === input.stage && row.flowStatus === input.flowStatus;
}

export async function objectiveChallengerContains(input: {
  target: ReestimateObjectiveTargetData;
  memberUser: TestUserAccountRecord;
}) {
  const row = await objectiveByTitle(input.target.title);
  return Boolean(row?.challengerUserIds.includes(input.memberUser.userId));
}

export async function objectiveReestimateDueFuture(target: ReestimateObjectiveTargetData) {
  const row = await objectiveByTitle(target.title);
  if (!row?.confirmationDueAt) return false;
  return new Date(row.confirmationDueAt).getTime() > Date.now();
}

export async function openAlignmentRequestAbsent(input: {
  target: ReestimateObjectiveTargetData;
  kind: ObjectiveAlignmentRequestKind;
}) {
  return (await openAlignmentRequestCount(input)) === 0;
}

export async function openAlignmentRequestCount(input: {
  target: ReestimateObjectiveTargetData;
  kind: ObjectiveAlignmentRequestKind;
}) {
  const objective = await objectiveByTitle(input.target.title);
  if (!objective) return 0;
  const rows = await db
    .select({ id: objectiveAlignmentRequests.id })
    .from(objectiveAlignmentRequests)
    .where(
      and(
        eq(objectiveAlignmentRequests.objectiveId, objective.id),
        eq(objectiveAlignmentRequests.kind, input.kind),
        inArray(objectiveAlignmentRequests.status, ["requested", "scheduled"]),
      ),
    );
  return rows.length;
}

export async function alignmentRequestExists(input: {
  target: ReestimateObjectiveTargetData;
  kind: ObjectiveAlignmentRequestKind;
  status: ObjectiveAlignmentRequestStatus;
  memberUser: TestUserAccountRecord;
}) {
  const objective = await objectiveByTitle(input.target.title);
  if (!objective) return false;
  const rows = await db
    .select({ id: objectiveAlignmentRequests.id })
    .from(objectiveAlignmentRequests)
    .where(
      and(
        eq(objectiveAlignmentRequests.objectiveId, objective.id),
        eq(objectiveAlignmentRequests.kind, input.kind),
        eq(objectiveAlignmentRequests.status, input.status),
        eq(objectiveAlignmentRequests.requestedByUserId, input.memberUser.userId),
      ),
    )
    .limit(1);
  return rows.length === 1;
}

export async function clickAddMetricAction(page: Page, targetTitle: string) {
  const panel = objectivePanel(page, targetTitle);
  await expect(panel).toBeVisible();
  await panel.hover();
  await panel.getByRole("button", { name: "新增子级", exact: true }).click();
  await panel.locator(".orf-block-menu").getByRole("button", { name: "提出指标", exact: true }).click();
  await expect(page.getByLabel("编辑指标标题", { exact: true })).toBeVisible();
}

export async function fillMetricTitle(page: Page, title: string) {
  await page.getByLabel("编辑指标标题", { exact: true }).fill(title);
}

export async function submitMetricTitle(page: Page, title: string) {
  await page.getByLabel("编辑指标标题", { exact: true }).press("Enter");
  await expect(metricRow(page, title)).toBeVisible();
  await expect.poll(() => metricByTitle(title)).not.toBeNull();
  const metric = await metricByTitle(title);
  if (!metric) {
    throw new Error(`新增指标未落库: ${title}`);
  }
  return metric;
}

export async function selectMetricDifficulty(page: Page, input: { metricTitle: string; difficulty: UncertaintyLevel }) {
  const row = metricRow(page, input.metricTitle);
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: /编辑指标难度/ }).click();
  await page.getByRole("listbox", { name: /编辑指标难度/ }).getByRole("option", { name: input.difficulty, exact: true }).click();
  await expect(row).toContainText(input.difficulty);
  await expect.poll(() => metricDifficultyEquals(input)).toBe(true);
}

export async function requestReestimateCompletion(page: Page, targetTitle: string) {
  const panel = objectivePanel(page, targetTitle);
  await expect(panel).toBeVisible();
  await panel.getByRole("button", { name: "申请完成重估", exact: true }).click();
  await expect(toast(page, "已申请重估对齐")).toBeVisible();
}

export async function readMyChallenges(page: Page): Promise<MyChallengesApiData> {
  return page.evaluate(async () => {
    const response = await fetch("/api/my-challenges?scope=mine", { credentials: "include" });
    if (!response.ok) {
      throw new Error(`读取我的挑战数据失败: ${response.status}`);
    }
    return response.json();
  });
}

export async function myChallengesContainsObjective(page: Page, title: string) {
  const data = await readMyChallenges(page);
  return data.objectives.some((objective) => objective.title === title);
}

export async function myChallengesContainsMetricWithDifficulty(page: Page, input: {
  targetTitle: string;
  metricTitle: string;
  difficulty: UncertaintyLevel;
  score: number;
}) {
  const data = await readMyChallenges(page);
  const objective = data.objectives.find((item) => item.title === input.targetTitle);
  if (!objective) return false;
  return data.results.some(
    (result) =>
      result.objectiveId === objective.id &&
      result.title === input.metricTitle &&
      result.uncertaintyLevel === input.difficulty &&
      result.uncertaintyScore === input.score,
  );
}

export async function myChallengesContainsOpenAlignmentRequest(page: Page, input: {
  targetTitle: string;
  kind: ObjectiveAlignmentRequestKind;
}) {
  const data = await readMyChallenges(page);
  const objective = data.objectives.find((item) => item.title === input.targetTitle);
  if (!objective) return false;
  return data.objectiveAlignmentRequests.some(
    (request) =>
      request.objectiveId === objective.id &&
      request.kind === input.kind &&
      (request.status === "requested" || request.status === "scheduled"),
  );
}

export async function metricExistsWithDifficulty(input: {
  target: ReestimateObjectiveTargetData;
  title: string;
  difficulty: UncertaintyLevel;
  score: number;
}) {
  const objective = await objectiveByTitle(input.target.title);
  if (!objective) return false;
  const row = await metricByTitle(input.title);
  return row?.objectiveId === objective.id && row.uncertaintyLevel === input.difficulty && row.uncertaintyScore === input.score;
}

async function metricDifficultyEquals(input: { metricTitle: string; difficulty: UncertaintyLevel }) {
  const row = await metricByTitle(input.metricTitle);
  return row?.uncertaintyLevel === input.difficulty;
}

async function objectiveByTitle(title: string) {
  const [row] = await db
    .select({
      id: objectives.id,
      title: objectives.title,
      stage: objectives.stage,
      flowStatus: objectives.flowStatus,
      challengerUserIds: objectives.challengerUserIds,
      confirmationDueAt: objectives.confirmationDueAt,
    })
    .from(objectives)
    .where(eq(objectives.title, title))
    .limit(1);
  return row ?? null;
}

async function metricByTitle(title: string) {
  const [row] = await db
    .select({
      id: results.id,
      objectiveId: results.objectiveId,
      title: results.title,
      uncertaintyLevel: results.uncertaintyLevel,
      uncertaintyScore: results.uncertaintyScore,
    })
    .from(results)
    .where(eq(results.title, title))
    .limit(1);
  return row ?? null;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIsoDate(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function addHoursIso(hours: number) {
  const date = new Date();
  date.setTime(date.getTime() + hours * 60 * 60 * 1000);
  return date.toISOString();
}

function escapeLike(value: string) {
  return value.replace(/[%_\\]/g, "\\$&");
}
