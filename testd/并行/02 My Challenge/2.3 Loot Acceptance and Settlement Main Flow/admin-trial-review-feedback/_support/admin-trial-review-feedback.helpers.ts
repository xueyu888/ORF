import { expect, type Page } from "@playwright/test";
import { eq, ilike } from "drizzle-orm";
import { objectiveLoot, objectives, objectiveTrialReviews, results } from "../../../../../../server/db/schema";
import type { LootResultClaim, ObjectiveTrialReviewStatus, UncertaintyLevel } from "../../../../../../src/types/orf";
import { createStableUuid } from "../../../../../_shared/ids";
import {
  deleteTestObjective,
  upsertTestObjective,
  type TestObjectiveFixtureRecord,
  type TestUserAccountRecord,
} from "../../../../../_operators/common.helpers";
import { db } from "../../../../../_operators/testd-db-client";
import type {
  ChallengesApiData,
  FrozenObjectiveTargetData,
  MetricData,
  TrialReviewData,
} from "./admin-trial-review-feedback.context";

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
  const tab = challengeScopeTab(page, label);
  await expect(tab).toBeVisible();
  await tab.click();
  await expect(tab).toHaveClass(/orf-scope-tab-active/);
}

export function challengeScopeTab(page: Page, label: string) {
  return page.getByRole("button", { name: label, exact: true });
}

export function objectivePanel(page: Page, title: string) {
  return page.locator(".orf-objective-panel").filter({ hasText: title }).first();
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
  adminUser: TestUserAccountRecord;
  memberUser: TestUserAccountRecord;
  target: FrozenObjectiveTargetData;
}): Promise<TestObjectiveFixtureRecord> {
  const record = await upsertTestObjective({
    teamId: input.adminUser.teamId,
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
    createdBy: input.adminUser.userId,
    updatedBy: input.adminUser.userId,
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
}) {
  const objective = await requiredObjectiveByTitle(input.target.title);
  const id = createStableUuid("testd-result", `${objective.id}:${input.metric.title}`);
  const values = {
    id,
    teamId: objective.teamId,
    objectiveId: objective.id,
    title: input.metric.title,
    detail: "TestD admin trial review feedback metric fixture",
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

export async function prepareRequestedTrialReview(input: {
  target: FrozenObjectiveTargetData;
  metric: MetricData;
  trialReview: TrialReviewData;
  memberUser: TestUserAccountRecord;
}) {
  const objective = await requiredObjectiveByTitle(input.target.title);
  const metric = await requiredMetricByTitle(input.metric.title);
  const id = createStableUuid("testd-objective-trial-review", `${objective.id}:${input.memberUser.userId}`);
  const values = {
    id,
    teamId: objective.teamId,
    objectiveId: objective.id,
    requestedBy: input.memberUser.name,
    requestedByUserId: input.memberUser.userId,
    body: input.trialReview.body,
    resultClaims: [
      {
        resultId: metric.id,
        claim: input.metric.claim,
        evidenceText: input.metric.evidence,
      },
    ],
    selfTestReportBody: input.trialReview.selfTestReportBody,
    status: input.trialReview.initialStatus,
    commanderFeedback: null,
    reviewedBy: null,
    reviewedByUserId: null,
    reviewedAt: null,
    requestedAt: addHoursIso(-1),
  };

  await db
    .insert(objectiveTrialReviews)
    .values(values)
    .onConflictDoUpdate({
      target: objectiveTrialReviews.objectiveId,
      set: {
        requestedBy: values.requestedBy,
        requestedByUserId: values.requestedByUserId,
        body: values.body,
        resultClaims: values.resultClaims,
        selfTestReportBody: values.selfTestReportBody,
        status: values.status,
        commanderFeedback: values.commanderFeedback,
        reviewedBy: values.reviewedBy,
        reviewedByUserId: values.reviewedByUserId,
        reviewedAt: values.reviewedAt,
        requestedAt: values.requestedAt,
      },
    });

  return trialReviewByTarget(input.target);
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

export async function objectiveLootCount(target: FrozenObjectiveTargetData) {
  const objective = await objectiveByTitle(target.title);
  if (!objective) return 0;
  const rows = await db.select({ id: objectiveLoot.id }).from(objectiveLoot).where(eq(objectiveLoot.objectiveId, objective.id));
  return rows.length;
}

export async function trialReviewCount(target: FrozenObjectiveTargetData) {
  const objective = await objectiveByTitle(target.title);
  if (!objective) return 0;
  const rows = await db.select({ id: objectiveTrialReviews.id }).from(objectiveTrialReviews).where(eq(objectiveTrialReviews.objectiveId, objective.id));
  return rows.length;
}

export async function trialReviewExists(input: {
  target: FrozenObjectiveTargetData;
  trialReview: TrialReviewData;
  memberUser: TestUserAccountRecord;
  status: ObjectiveTrialReviewStatus;
  commanderFeedback?: string | null;
}) {
  const review = await trialReviewByTarget(input.target);
  return (
    review?.status === input.status &&
    review.requestedByUserId === input.memberUser.userId &&
    review.body === input.trialReview.body &&
    (input.commanderFeedback === undefined || review.commanderFeedback === input.commanderFeedback)
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
  const metric = await metricByTitle(input.metric.title);
  const review = await trialReviewByTarget(input.target);
  if (!metric || !review) return false;
  return hasClaim(review.resultClaims, {
    resultId: metric.id,
    claim: input.metric.claim,
    evidenceText: input.metric.evidence,
  });
}

export async function trialReviewFeedbackEmpty(target: FrozenObjectiveTargetData) {
  const review = await trialReviewByTarget(target);
  return review?.commanderFeedback === null;
}

export async function trialReviewReviewedAtEmpty(target: FrozenObjectiveTargetData) {
  const review = await trialReviewByTarget(target);
  return review?.reviewedAt === null;
}

export async function trialReviewReviewedBy(input: {
  target: FrozenObjectiveTargetData;
  adminUser: TestUserAccountRecord;
}) {
  const review = await trialReviewByTarget(input.target);
  return review?.reviewedByUserId === input.adminUser.userId;
}

export async function trialReviewReviewedAtExists(target: FrozenObjectiveTargetData) {
  const review = await trialReviewByTarget(target);
  return typeof review?.reviewedAt === "string" && review.reviewedAt.length > 0;
}

export async function openTrialReviewPageFromAllChallenges(page: Page, input: { targetTitle: string }) {
  await expect(challengeScopeTab(page, "所有挑战")).toHaveClass(/orf-scope-tab-active/);
  const panel = objectivePanel(page, input.targetTitle);
  await expect(panel).toBeVisible();
  const action = panel.getByRole("link", { name: "处理试验收", exact: true });
  await expect(action).toBeVisible();
  await action.click();
}

export async function waitTrialReviewPageLoaded(page: Page, input: { targetTitle: string }) {
  await expect(page).toHaveURL(/\/tasks\/objectives\/[^/]+\/loot(?:[?#].*)?$/);
  await expect(page.getByRole("heading", { name: "处理试验收" })).toBeVisible();
  await expect(page.getByText(input.targetTitle, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "提交反馈", exact: true })).toBeVisible();
}

export async function selectTrialDecision(page: Page, decisionLabel: string) {
  const button = page.getByRole("button", { name: "试验收结论", exact: true });
  await expect(button).toBeVisible();
  await button.click();
  const option = page.getByRole("option", { name: decisionLabel, exact: true });
  await expect(option).toBeVisible();
  await option.click();
  await expect(button).toContainText(decisionLabel);
}

export async function fillTrialFeedback(page: Page, feedback: string) {
  const input = page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: "提交反馈", exact: true }) })
    .locator("textarea")
    .first();
  await expect(input).toBeVisible({ timeout: 15_000 });
  await input.fill(feedback);
  await expect(input).toHaveValue(feedback);
}

export async function submitTrialFeedback(page: Page, input: {
  target: FrozenObjectiveTargetData;
  trialReview: TrialReviewData;
  adminUser: TestUserAccountRecord;
  memberUser: TestUserAccountRecord;
}) {
  await observeToastMessages(page);
  const responsePromise = page.waitForResponse(
    (response) => response.request().method() === "PATCH" && response.url().includes("/trial-reviews/"),
  );
  const button = page.getByRole("button", { name: "提交反馈", exact: true });
  await expect(button).toBeEnabled();
  await button.click();
  const response = await responsePromiseOrNull(responsePromise);
  if (response && !response.ok()) {
    throw new Error(`提交试验收反馈接口失败: ${response.status()} ${response.url()}`);
  }
  await expect
    .poll(
      async () =>
        (await allChallengesContainsTrialReview(page, {
          targetTitle: input.target.title,
          status: input.trialReview.reviewedStatus,
          commanderFeedback: input.trialReview.commanderFeedback,
          memberUser: input.memberUser,
          adminUser: input.adminUser,
        })) ||
        (await trialReviewExists({
          target: input.target,
          trialReview: input.trialReview,
          memberUser: input.memberUser,
          status: input.trialReview.reviewedStatus,
          commanderFeedback: input.trialReview.commanderFeedback,
        })),
      { timeout: 15_000 },
    )
    .toBe(true);
}

export async function readAllChallenges(page: Page): Promise<ChallengesApiData> {
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

export async function allChallengesObjectiveHasStageAndFlowStatus(page: Page, target: FrozenObjectiveTargetData) {
  const data = await readAllChallenges(page);
  const objective = data.objectives.find((item) => item.title === target.title);
  return objective?.stage === target.stage && objective.flowStatus === target.flowStatus;
}

export async function allChallengesContainsTrialReview(page: Page, input: {
  targetTitle: string;
  status: ObjectiveTrialReviewStatus;
  commanderFeedback: string;
  memberUser: TestUserAccountRecord;
  adminUser: TestUserAccountRecord;
}) {
  const data = await readAllChallenges(page);
  const objective = data.objectives.find((item) => item.title === input.targetTitle);
  if (!objective) return false;
  return data.objectiveTrialReviews.some(
    (review) =>
      review.objectiveId === objective.id &&
      review.status === input.status &&
      review.requestedByUserId === input.memberUser.userId &&
      review.commanderFeedback === input.commanderFeedback &&
      review.reviewedByUserId === input.adminUser.userId,
  );
}

export async function allChallengesTrialReviewReviewedBy(page: Page, input: {
  targetTitle: string;
  adminUser: TestUserAccountRecord;
}) {
  const data = await readAllChallenges(page);
  const objective = data.objectives.find((item) => item.title === input.targetTitle);
  if (!objective) return false;
  const review = data.objectiveTrialReviews.find((item) => item.objectiveId === objective.id);
  return review?.reviewedByUserId === input.adminUser.userId;
}

export async function allChallengesTrialReviewReviewedAtExists(page: Page, targetTitle: string) {
  const data = await readAllChallenges(page);
  const objective = data.objectives.find((item) => item.title === targetTitle);
  if (!objective) return false;
  const review = data.objectiveTrialReviews.find((item) => item.objectiveId === objective.id);
  return typeof review?.reviewedAt === "string" && review.reviewedAt.length > 0;
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
      commanderFeedback: objectiveTrialReviews.commanderFeedback,
      reviewedByUserId: objectiveTrialReviews.reviewedByUserId,
      reviewedAt: objectiveTrialReviews.reviewedAt,
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

async function requiredMetricByTitle(title: string) {
  const metric = await metricByTitle(title);
  if (!metric) {
    throw new Error(`指标不存在: ${title}`);
  }
  return metric;
}

function hasClaim(claims: LootResultClaim[], expected: { resultId: string; claim: MetricData["claim"]; evidenceText: string }) {
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
