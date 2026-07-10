import { expect, type Page } from "@playwright/test";
import { and, eq, ilike, inArray } from "drizzle-orm";
import { objectiveAlignmentRequests, objectives, results } from "../../../../../../server/db/schema";
import type { ObjectiveAlignmentRequestKind, ObjectiveAlignmentRequestStatus, UncertaintyLevel } from "../../../../../../src/types/orf";
import { createStableUuid } from "../../../../../_shared/ids";
import {
  deleteTestObjective,
  upsertTestObjective,
  type TestObjectiveFixtureRecord,
  type TestUserAccountRecord,
} from "../../../../../_operators/common.helpers";
import { db } from "../../../../../_operators/testd-db-client";
import type { MetricData, MyChallengesApiData, ObjectiveTargetData } from "./admin-freeze-calibrated-reestimate-objective.context";

export async function loginAsAdmin(page: Page, input: { email: string; password: string }) {
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

export async function selectChallengeScope(page: Page, label: string) {
  await challengeScopeTab(page, label).click();
  await expect(challengeScopeTab(page, label)).toHaveClass(/orf-scope-tab-active/);
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
  adminUser: TestUserAccountRecord;
  memberUser: TestUserAccountRecord;
  target: ObjectiveTargetData;
}): Promise<TestObjectiveFixtureRecord> {
  const finalDueAt = addDaysIsoDate(14);
  const record = await upsertTestObjective({
    teamId: input.adminUser.teamId,
    title: input.target.title,
    stage: input.target.stage,
    flowStatus: input.target.flowStatus,
    status: "On Track",
    progress: 20,
    finalDueAt,
    challengers: [input.memberUser.name],
    challengerUserIds: [input.memberUser.userId],
    assignedChallengers: [],
    assignedChallengerUserIds: [],
    createdBy: input.adminUser.userId,
    updatedBy: input.adminUser.userId,
  });

  await db
    .update(objectives)
    .set({
      acceptedAt: addHoursIso(-2),
      confirmationDueAt: addHoursIso(24),
      confirmedAt: null,
      updatedAt: today(),
    })
    .where(eq(objectives.id, record.id));

  return record;
}

export async function prepareCalibratedMetric(input: {
  target: ObjectiveTargetData;
  metric: MetricData;
  memberUser: TestUserAccountRecord;
}) {
  const objective = await requiredObjectiveByTitle(input.target.title);
  const id = createStableUuid("testd-result", `${objective.id}:${input.metric.title}`);
  const values = {
    id,
    teamId: objective.teamId,
    objectiveId: objective.id,
    title: input.metric.title,
    detail: "TestD calibrated metric fixture",
    uncertaintyLevel: input.metric.difficulty,
    baseline: 0,
    current: 0,
    target: 100,
    unit: "%",
    direction: "increase" as const,
    status: "Draft" as const,
    confidence: 50,
    source: "memberProposed" as const,
    definer: input.memberUser.name,
    definerUserId: input.memberUser.userId,
    uncertaintyScore: input.metric.score,
    acceptedResult: "unreviewed" as const,
    reviewCadence: "Weekly",
    sortOrder: 0,
    createdAt: today(),
    updatedAt: today(),
    createdBy: input.memberUser.userId,
    updatedBy: input.memberUser.userId,
  };

  await db
    .insert(results)
    .values(values)
    .onConflictDoUpdate({
      target: results.id,
      set: {
        teamId: values.teamId,
        objectiveId: values.objectiveId,
        title: values.title,
        detail: values.detail,
        uncertaintyLevel: values.uncertaintyLevel,
        baseline: values.baseline,
        current: values.current,
        target: values.target,
        unit: values.unit,
        direction: values.direction,
        status: values.status,
        confidence: values.confidence,
        source: values.source,
        definer: values.definer,
        definerUserId: values.definerUserId,
        uncertaintyScore: values.uncertaintyScore,
        acceptedResult: values.acceptedResult,
        reviewCadence: values.reviewCadence,
        sortOrder: values.sortOrder,
        updatedAt: values.updatedAt,
        createdBy: values.createdBy,
        updatedBy: values.updatedBy,
      },
    });

  return metricByTitle(input.metric.title);
}

export async function prepareReestimateCompletionRequest(input: {
  target: ObjectiveTargetData;
  kind: ObjectiveAlignmentRequestKind;
  status: ObjectiveAlignmentRequestStatus;
  memberUser: TestUserAccountRecord;
}) {
  const objective = await requiredObjectiveByTitle(input.target.title);
  const id = createStableUuid("testd-objective-alignment-request", `${objective.id}:${input.kind}`);
  const values = {
    id,
    teamId: objective.teamId,
    objectiveId: objective.id,
    kind: input.kind,
    requestedBy: input.memberUser.name,
    requestedByUserId: input.memberUser.userId,
    status: input.status,
    proposedAt: nowIso(),
    scheduledAt: null,
    meetingRoom: null,
    note: null,
    confirmationDueAt: null,
    commanderFeedback: null,
    reviewedBy: null,
    reviewedByUserId: null,
    reviewedAt: null,
  };

  await db
    .insert(objectiveAlignmentRequests)
    .values(values)
    .onConflictDoUpdate({
      target: objectiveAlignmentRequests.id,
      set: {
        teamId: values.teamId,
        objectiveId: values.objectiveId,
        kind: values.kind,
        requestedBy: values.requestedBy,
        requestedByUserId: values.requestedByUserId,
        status: values.status,
        proposedAt: values.proposedAt,
        scheduledAt: values.scheduledAt,
        meetingRoom: values.meetingRoom,
        note: values.note,
        confirmationDueAt: values.confirmationDueAt,
        commanderFeedback: values.commanderFeedback,
        reviewedBy: values.reviewedBy,
        reviewedByUserId: values.reviewedByUserId,
        reviewedAt: values.reviewedAt,
      },
    });

  return alignmentRequestById(id);
}

export async function objectiveHasStageAndFlowStatus(input: ObjectiveTargetData) {
  const row = await objectiveByTitle(input.title);
  return row?.stage === input.stage && row.flowStatus === input.flowStatus;
}

export async function objectiveConfirmedAtExists(target: ObjectiveTargetData) {
  const row = await objectiveByTitle(target.title);
  return typeof row?.confirmedAt === "string" && row.confirmedAt.length > 0;
}

export async function objectiveChallengerContains(input: {
  target: ObjectiveTargetData;
  memberUser: TestUserAccountRecord;
}) {
  const row = await objectiveByTitle(input.target.title);
  return Boolean(row?.challengerUserIds.includes(input.memberUser.userId));
}

export async function metricExistsWithScore(input: {
  target: ObjectiveTargetData;
  title: string;
  difficulty: UncertaintyLevel;
  score: number;
}) {
  const objective = await objectiveByTitle(input.target.title);
  if (!objective) return false;
  const row = await metricByTitle(input.title);
  return row?.objectiveId === objective.id && row.uncertaintyLevel === input.difficulty && row.uncertaintyScore === input.score;
}

export async function alignmentRequestExists(input: {
  target: ObjectiveTargetData;
  kind: ObjectiveAlignmentRequestKind;
  status: ObjectiveAlignmentRequestStatus;
  memberUser: TestUserAccountRecord;
  adminUser?: TestUserAccountRecord;
}) {
  const objective = await objectiveByTitle(input.target.title);
  if (!objective) return false;
  const rows = await db
    .select({
      id: objectiveAlignmentRequests.id,
      reviewedByUserId: objectiveAlignmentRequests.reviewedByUserId,
    })
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
  const request = rows[0];
  if (!request) return false;
  return input.adminUser ? request.reviewedByUserId === input.adminUser.userId : true;
}

export async function openAlignmentRequestCount(input: {
  target: ObjectiveTargetData;
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

export async function clickCompleteAndFreeze(page: Page, targetTitle: string) {
  const panel = objectivePanel(page, targetTitle);
  await expect(panel).toBeVisible();
  const button = panel.getByRole("button", { name: "完成并冻结", exact: true });
  await expect(button).toBeEnabled();
  const responsePromise = page.waitForResponse(
    (response) => response.request().method() === "PATCH" && response.url().includes("/alignment-requests/"),
  );
  await button.click();
  const response = await responsePromise;
  if (!response.ok()) {
    throw new Error(`完成并冻结接口失败: ${response.status()} ${response.url()}`);
  }
  await expect(toast(page, "对齐已完成")).toBeVisible();
}

export async function completeAndFreezeActionHidden(page: Page, targetTitle: string) {
  await expect(objectivePanel(page, targetTitle).getByRole("button", { name: "完成并冻结", exact: true })).toHaveCount(0);
}

export async function readAllChallenges(page: Page): Promise<MyChallengesApiData> {
  return page.evaluate(async () => {
    const response = await fetch("/api/my-challenges?scope=all", { credentials: "include" });
    if (!response.ok) {
      throw new Error(`读取所有挑战数据失败: ${response.status}`);
    }
    return response.json();
  });
}

export async function allChallengesContainsObjective(page: Page, title: string) {
  const data = await readAllChallenges(page);
  return data.objectives.some((objective) => objective.title === title);
}

export async function allChallengesObjectiveHasStageAndFlowStatus(page: Page, target: ObjectiveTargetData) {
  const data = await readAllChallenges(page);
  const objective = data.objectives.find((item) => item.title === target.title);
  return objective?.stage === target.stage && objective.flowStatus === target.flowStatus;
}

export async function allChallengesContainsMetricWithScore(page: Page, input: {
  targetTitle: string;
  metricTitle: string;
  difficulty: UncertaintyLevel;
  score: number;
}) {
  const data = await readAllChallenges(page);
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

export async function allChallengesContainsAlignmentRequestStatus(page: Page, input: {
  targetTitle: string;
  kind: ObjectiveAlignmentRequestKind;
  status: ObjectiveAlignmentRequestStatus;
}) {
  const data = await readAllChallenges(page);
  const objective = data.objectives.find((item) => item.title === input.targetTitle);
  if (!objective) return false;
  return data.objectiveAlignmentRequests.some(
    (request) =>
      request.objectiveId === objective.id &&
      request.kind === input.kind &&
      request.status === input.status,
  );
}

async function objectiveByTitle(title: string) {
  const [row] = await db
    .select({
      id: objectives.id,
      teamId: objectives.teamId,
      title: objectives.title,
      stage: objectives.stage,
      flowStatus: objectives.flowStatus,
      challengerUserIds: objectives.challengerUserIds,
      confirmedAt: objectives.confirmedAt,
    })
    .from(objectives)
    .where(eq(objectives.title, title))
    .limit(1);
  return row ?? null;
}

async function requiredObjectiveByTitle(title: string) {
  const objective = await objectiveByTitle(title);
  if (!objective) {
    throw new Error(`目标不存在: ${title}`);
  }
  return objective;
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

async function alignmentRequestById(id: string) {
  const [row] = await db.select().from(objectiveAlignmentRequests).where(eq(objectiveAlignmentRequests.id, id)).limit(1);
  return row ?? null;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function nowIso() {
  return new Date().toISOString();
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
