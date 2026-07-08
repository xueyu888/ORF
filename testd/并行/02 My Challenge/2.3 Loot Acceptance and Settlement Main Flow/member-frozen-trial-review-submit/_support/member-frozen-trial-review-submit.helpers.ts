import { expect, type Page } from "@playwright/test";
import { and, eq, ilike } from "drizzle-orm";
import { objectiveLoot, objectives, objectiveTrialReviews, results } from "../../../../../../server/db/schema";
import type { LootResultClaim, LootResultClaimStatus, ObjectiveTrialReviewStatus, UncertaintyLevel } from "../../../../../../src/types/orf";
import { createStableUuid } from "../../../../../_shared/ids";
import {
  deleteTestObjective,
  upsertTestObjective,
  type TestObjectiveFixtureRecord,
  type TestUserAccountRecord,
} from "../../../../../_operators/common.helpers";
import { db } from "../../../../../_operators/testd-db-client";
import type {
  FrozenObjectiveTargetData,
  MetricData,
  MyChallengesApiData,
  TrialReviewData,
} from "./member-frozen-trial-review-submit.context";

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

export function lootMetricPanel(page: Page, metricTitle: string) {
  return page.locator(".grid.gap-2.rounded-md.border.orf-border.p-3").filter({ hasText: metricTitle }).first();
}

export function toast(page: Page, text: string | RegExp) {
  return page.locator(".orf-toast-card").filter({ hasText: text });
}

export async function observeToastMessages(page: Page) {
  await page.evaluate(() => {
    const testWindow = window as Window & {
      __testdObservedToastMessages?: string[];
      __testdToastObserver?: MutationObserver;
    };
    testWindow.__testdObservedToastMessages = [];
    testWindow.__testdToastObserver?.disconnect();

    const recordToasts = () => {
      const messages = [...document.querySelectorAll(".orf-toast-card")]
        .map((item) => item.textContent?.trim() ?? "")
        .filter(Boolean);
      testWindow.__testdObservedToastMessages?.push(...messages);
    };

    recordToasts();
    const observer = new MutationObserver(recordToasts);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    testWindow.__testdToastObserver = observer;
  });
}

export async function toastMessageAppeared(page: Page, text: string) {
  const visibleCount = await toast(page, text).count();
  if (visibleCount > 0) return true;

  return page.evaluate((expectedText) => {
    const messages = (window as Window & { __testdObservedToastMessages?: string[] }).__testdObservedToastMessages ?? [];
    return messages.some((message) => message.includes(expectedText));
  }, text);
}

export async function readSessionUserName(page: Page) {
  const response = await page.evaluate(async () => {
    const sessionResponse = await fetch("/api/auth/session", { credentials: "include" });
    return {
      status: sessionResponse.status,
      body: await sessionResponse.json().catch(() => ({})),
    };
  });

  if (response.status !== 200 || response.body?.authenticated !== true) return null;
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

export async function prepareFrozenObjective(input: {
  memberUser: TestUserAccountRecord;
  target: FrozenObjectiveTargetData;
}): Promise<TestObjectiveFixtureRecord> {
  const record = await upsertTestObjective({
    teamId: input.memberUser.teamId,
    title: input.target.title,
    stage: input.target.stage,
    flowStatus: input.target.flowStatus,
    status: "On Track",
    progress: 20,
    finalDueAt: addDaysIsoDate(input.target.finalDueOffsetDays),
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
      acceptedAt: addHoursIso(-48),
      confirmationDueAt: null,
      confirmedAt: addHoursIso(-1),
      lootSubmittedAt: null,
      updatedAt: today(),
    })
    .where(eq(objectives.id, record.id));

  return record;
}

export async function prepareCalibratedMetric(input: {
  target: FrozenObjectiveTargetData;
  metric: MetricData;
  memberUser: TestUserAccountRecord;
  sortOrder: number;
}) {
  const objective = await requiredObjectiveByTitle(input.target.title);
  const id = createStableUuid("testd-result", `${objective.id}:${input.metric.title}`);
  const values = {
    id,
    teamId: objective.teamId,
    objectiveId: objective.id,
    title: input.metric.title,
    detail: "TestD frozen trial review metric fixture",
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
    sortOrder: input.sortOrder,
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

export async function deleteTrialReviewsByTarget(target: FrozenObjectiveTargetData) {
  const objective = await objectiveByTitle(target.title);
  if (!objective) return;
  await db.delete(objectiveTrialReviews).where(eq(objectiveTrialReviews.objectiveId, objective.id));
}

export async function deleteObjectiveLootByTarget(target: FrozenObjectiveTargetData) {
  const objective = await objectiveByTitle(target.title);
  if (!objective) return;
  await db.delete(objectiveLoot).where(eq(objectiveLoot.objectiveId, objective.id));
}

export async function objectiveHasStageAndFlowStatus(input: FrozenObjectiveTargetData) {
  const row = await objectiveByTitle(input.title);
  return row?.stage === input.stage && row.flowStatus === input.flowStatus;
}

export async function objectiveChallengerContains(input: {
  target: FrozenObjectiveTargetData;
  memberUser: TestUserAccountRecord;
}) {
  const row = await objectiveByTitle(input.target.title);
  return Boolean(row?.challengerUserIds.includes(input.memberUser.userId));
}

export async function objectiveConfirmedAtExists(target: FrozenObjectiveTargetData) {
  const row = await objectiveByTitle(target.title);
  return typeof row?.confirmedAt === "string" && row.confirmedAt.length > 0;
}

export async function objectiveLootSubmittedAtEmpty(target: FrozenObjectiveTargetData) {
  const row = await objectiveByTitle(target.title);
  return row?.lootSubmittedAt === null;
}

export async function metricExistsWithScore(input: {
  target: FrozenObjectiveTargetData;
  title: string;
  difficulty: UncertaintyLevel;
  score: number;
}) {
  const objective = await objectiveByTitle(input.target.title);
  if (!objective) return false;
  const row = await metricByTitle(input.title);
  return row?.objectiveId === objective.id && row.uncertaintyLevel === input.difficulty && row.uncertaintyScore === input.score;
}

export async function trialReviewCount(target: FrozenObjectiveTargetData) {
  const objective = await objectiveByTitle(target.title);
  if (!objective) return 0;
  const rows = await db.select({ id: objectiveTrialReviews.id }).from(objectiveTrialReviews).where(eq(objectiveTrialReviews.objectiveId, objective.id));
  return rows.length;
}

export async function objectiveLootCount(target: FrozenObjectiveTargetData) {
  const objective = await objectiveByTitle(target.title);
  if (!objective) return 0;
  const rows = await db.select({ id: objectiveLoot.id }).from(objectiveLoot).where(eq(objectiveLoot.objectiveId, objective.id));
  return rows.length;
}

export async function trialReviewExists(input: {
  target: FrozenObjectiveTargetData;
  trialReview: TrialReviewData;
  memberUser: TestUserAccountRecord;
}) {
  const review = await trialReviewByTarget(input.target);
  return (
    review?.status === input.trialReview.status &&
    review.requestedByUserId === input.memberUser.userId &&
    review.body === input.trialReview.body
  );
}

export async function trialReviewHasSelfTest(input: {
  target: FrozenObjectiveTargetData;
  selfTestReportBody: string;
}) {
  const review = await trialReviewByTarget(input.target);
  return review?.selfTestReportBody === input.selfTestReportBody;
}

export async function trialReviewHasMetricClaim(input: {
  target: FrozenObjectiveTargetData;
  metric: MetricData;
}) {
  const objective = await objectiveByTitle(input.target.title);
  if (!objective) return false;
  const metric = await metricByTitle(input.metric.title);
  const review = await trialReviewByTarget(input.target);
  if (!metric || !review) return false;
  return hasClaim(review.resultClaims, {
    resultId: metric.id,
    claim: input.metric.claim,
    evidenceText: input.metric.evidence,
  });
}

export async function openLootPageFromMyChallenges(page: Page, input: { targetTitle: string }) {
  const panel = objectivePanel(page, input.targetTitle);
  await expect(panel).toBeVisible();
  const action = panel.getByRole("link", { name: "提交战利品", exact: true });
  await expect(action).toBeVisible();
  await action.click();
}

export async function waitLootPageLoaded(page: Page, input: { targetTitle: string }) {
  await expect(page).toHaveURL(/\/tasks\/objectives\/[^/]+\/loot(?:[?#].*)?$/);
  await expect(page.getByRole("heading", { name: "提交战利品" })).toBeVisible();
  await expect(page.getByText(input.targetTitle, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "提交试验收", exact: true })).toBeVisible();
}

export async function fillLootBody(page: Page, body: string) {
  const input = page.getByRole("textbox", { name: "完成说明", exact: true });
  await expect(input).toBeVisible();
  await input.fill(body);
  await expect(input).toHaveValue(body);
}

export async function selectMetricClaim(page: Page, input: { metricTitle: string; claimLabel: string }) {
  const button = page.getByRole("button", { name: `${input.metricTitle} 完成主张`, exact: true });
  await expect(button).toBeVisible();
  await button.click();
  const option = page.getByRole("option", { name: input.claimLabel, exact: true });
  await expect(option).toBeVisible();
  await option.click();
  await expect(button).toContainText(input.claimLabel);
}

export async function fillMetricEvidence(page: Page, input: { metricTitle: string; evidence: string }) {
  const panel = lootMetricPanel(page, input.metricTitle);
  await expect(panel).toBeVisible();
  const evidence = panel.getByPlaceholder("证据、数据或链接");
  await expect(evidence).toBeVisible();
  await evidence.fill(input.evidence);
  await expect(evidence).toHaveValue(input.evidence);
}

export async function fillSelfTestReport(page: Page, selfTestReportBody: string) {
  const input = page.getByRole("textbox", { name: "自测报告", exact: true });
  await expect(input).toBeVisible();
  await input.fill(selfTestReportBody);
  await expect(input).toHaveValue(selfTestReportBody);
}

export async function submitTrialReview(page: Page, input: {
  target: FrozenObjectiveTargetData;
  trialReview: TrialReviewData;
}) {
  await observeToastMessages(page);
  const responsePromise = page.waitForResponse(
    (response) => response.request().method() === "POST" && response.url().includes("/trial-reviews"),
  );
  const button = page.getByRole("button", { name: "提交试验收", exact: true });
  await expect(button).toBeEnabled();
  await button.click();
  const response = await responsePromiseOrNull(responsePromise);
  if (response && !response.ok()) {
    throw new Error(`提交试验收接口失败: ${response.status()} ${response.url()}`);
  }
  await expect
    .poll(
      async () =>
        (await myChallengesContainsTrialReview(page, {
          targetTitle: input.target.title,
          status: input.trialReview.status,
          body: input.trialReview.body,
        })) ||
        (await trialReviewExistsByTitle({
          targetTitle: input.target.title,
          status: input.trialReview.status,
          body: input.trialReview.body,
        })),
      { timeout: 15_000 },
    )
    .toBe(true);
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

export async function myChallengesObjectiveHasStageAndFlowStatus(page: Page, target: FrozenObjectiveTargetData) {
  const data = await readMyChallenges(page);
  const objective = data.objectives.find((item) => item.title === target.title);
  return objective?.stage === target.stage && objective.flowStatus === target.flowStatus;
}

export async function myChallengesContainsTrialReview(page: Page, input: {
  targetTitle: string;
  status: ObjectiveTrialReviewStatus;
  body: string;
  memberUser?: TestUserAccountRecord;
}) {
  const data = await readMyChallenges(page);
  const objective = data.objectives.find((item) => item.title === input.targetTitle);
  if (!objective) return false;
  return data.objectiveTrialReviews.some(
    (review) =>
      review.objectiveId === objective.id &&
      review.status === input.status &&
      review.body === input.body &&
      (!input.memberUser || review.requestedByUserId === input.memberUser.userId),
  );
}

export async function myChallengesTrialReviewHasSelfTest(page: Page, input: {
  targetTitle: string;
  selfTestReportBody: string;
}) {
  const data = await readMyChallenges(page);
  const objective = data.objectives.find((item) => item.title === input.targetTitle);
  if (!objective) return false;
  const review = data.objectiveTrialReviews.find((item) => item.objectiveId === objective.id);
  return review?.selfTestReportBody === input.selfTestReportBody;
}

export async function myChallengesTrialReviewHasMetricClaim(page: Page, input: {
  targetTitle: string;
  metric: MetricData;
}) {
  const data = await readMyChallenges(page);
  const objective = data.objectives.find((item) => item.title === input.targetTitle);
  if (!objective) return false;
  const metric = data.results.find((item) => item.objectiveId === objective.id && item.title === input.metric.title);
  const review = data.objectiveTrialReviews.find((item) => item.objectiveId === objective.id);
  if (!metric || !review) return false;
  return hasClaim(review.resultClaims, {
    resultId: metric.id,
    claim: input.metric.claim,
    evidenceText: input.metric.evidence,
  });
}

async function trialReviewExistsByTitle(input: {
  targetTitle: string;
  status: ObjectiveTrialReviewStatus;
  body: string;
}) {
  const objective = await objectiveByTitle(input.targetTitle);
  if (!objective) return false;
  const rows = await db
    .select({ id: objectiveTrialReviews.id })
    .from(objectiveTrialReviews)
    .where(
      and(
        eq(objectiveTrialReviews.objectiveId, objective.id),
        eq(objectiveTrialReviews.status, input.status),
        eq(objectiveTrialReviews.body, input.body),
      ),
    )
    .limit(1);
  return rows.length === 1;
}

async function trialReviewByTarget(target: FrozenObjectiveTargetData) {
  const objective = await objectiveByTitle(target.title);
  if (!objective) return null;
  const [row] = await db
    .select({
      id: objectiveTrialReviews.id,
      requestedByUserId: objectiveTrialReviews.requestedByUserId,
      body: objectiveTrialReviews.body,
      resultClaims: objectiveTrialReviews.resultClaims,
      selfTestReportBody: objectiveTrialReviews.selfTestReportBody,
      status: objectiveTrialReviews.status,
    })
    .from(objectiveTrialReviews)
    .where(eq(objectiveTrialReviews.objectiveId, objective.id))
    .limit(1);
  return row ?? null;
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
      lootSubmittedAt: objectives.lootSubmittedAt,
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

function hasClaim(claims: LootResultClaim[], expected: { resultId: string; claim: LootResultClaimStatus; evidenceText: string }) {
  return claims.some(
    (claim) =>
      claim.resultId === expected.resultId &&
      claim.claim === expected.claim &&
      claim.evidenceText === expected.evidenceText,
  );
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

async function responsePromiseOrNull<T>(promise: Promise<T>): Promise<T | null> {
  try {
    return await promise;
  } catch (error) {
    if (isWaitForResponseTimeout(error)) {
      return null;
    }
    throw error;
  }
}

function isWaitForResponseTimeout(error: unknown) {
  return error instanceof Error && /Timeout \d+ms exceeded while waiting for event "response"/.test(error.message);
}
