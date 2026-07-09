import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import { and, eq, ilike } from "drizzle-orm";
import {
  objectiveAcceptanceReviews,
  objectiveLoot,
  objectiveSettlementEvents,
  objectives,
  results,
} from "../../../../../../server/db/schema";
import type {
  LootResultClaim,
  LootResultClaimStatus,
  ObjectiveAcceptedResult,
  ResultAcceptedResult,
  UncertaintyLevel,
} from "../../../../../../src/types/orf";
import { createStableUuid } from "../../../../../_shared/ids";
import {
  deleteTestObjective,
  upsertTestObjective,
  type TestObjectiveFixtureRecord,
  type TestUserAccountRecord,
} from "../../../../../_operators/common.helpers";
import { db } from "../../../../../_operators/testd-db-client";
import type {
  AcceptedObjectiveTargetData,
  FinalLootData,
  LocalSettlementReview,
  LocalSettlementReviewResponse,
  MetricData,
  MyChallengesApiData,
  PeerReviewInputData,
} from "./member-peer-review-submit.context";

export async function loginAsMember(page: Page, input: { email: string; password: string }) {
  await page.goto("/auth");
  await page.getByLabel("Email").fill(input.email);
  await page.getByLabel("Password", { exact: true }).fill(input.password);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect
    .poll(async () => {
      const response = await page.evaluate(async () => {
        const sessionResponse = await fetch("/api/auth/session", { credentials: "include" });
        return {
          status: sessionResponse.status,
          body: await sessionResponse.json(),
        };
      });
      return response.status === 200 && response.body?.authenticated === true;
    })
    .toBe(true);
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

export async function localSettlementServiceAvailable(_page: Page) {
  const serviceBaseUrl = (process.env.ORF_LOCAL_SETTLEMENT_SERVICE_URL ?? "http://127.0.0.1:8799").replace(/\/+$/, "");
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3_000);

  try {
    const response = await fetch(`${serviceBaseUrl}/health`, { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
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

export async function prepareAcceptedObjective(input: {
  adminUser: TestUserAccountRecord;
  memberUser: TestUserAccountRecord;
  teammateUser: TestUserAccountRecord;
  target: AcceptedObjectiveTargetData;
}): Promise<TestObjectiveFixtureRecord> {
  const record = await upsertTestObjective({
    id: `obj-${randomUUID()}`,
    teamId: input.adminUser.teamId,
    title: input.target.title,
    stage: input.target.stage,
    flowStatus: input.target.flowStatus,
    status: "On Track",
    progress: 100,
    finalDueAt: addDaysIsoDate(input.target.finalDueOffsetDays),
    challengers: [input.memberUser.name, input.teammateUser.name],
    challengerUserIds: [input.memberUser.userId, input.teammateUser.userId],
    assignedChallengers: [],
    assignedChallengerUserIds: [],
    createdBy: input.adminUser.userId,
    updatedBy: input.adminUser.userId,
  });

  await db
    .update(objectives)
    .set({
      acceptedAt: addHoursIso(-2),
      acceptedResult: "completed",
      completionMultiplier: 1,
      objectiveBasePoints: 30,
      objectiveSettlementPoints: null,
      confirmationDueAt: null,
      confirmedAt: addHoursIso(-72),
      lootSubmittedAt: addHoursIso(-4),
      updatedAt: today(),
      updatedBy: input.adminUser.userId,
    })
    .where(eq(objectives.id, record.id));

  const updated = await objectiveByTitle(input.target.title);
  if (!updated) {
    throw new Error(`已验收目标准备失败: ${input.target.title}`);
  }
  return record;
}

export async function prepareAcceptedMetric(input: {
  target: AcceptedObjectiveTargetData;
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
    detail: "TestD member peer review metric fixture",
    uncertaintyLevel: input.metric.difficulty,
    baseline: 0,
    current: 100,
    target: 100,
    unit: "%",
    direction: "increase" as const,
    status: "Draft" as const,
    confidence: 90,
    source: "memberProposed" as const,
    definer: input.memberUser.name,
    definerUserId: input.memberUser.userId,
    uncertaintyScore: input.metric.score,
    acceptedResult: input.metric.acceptedResult,
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

export async function prepareFinalObjectiveLoot(input: {
  target: AcceptedObjectiveTargetData;
  metric: MetricData;
  finalLoot: FinalLootData;
  memberUser: TestUserAccountRecord;
}) {
  const objective = await requiredObjectiveByTitle(input.target.title);
  const metric = await requiredMetricByTitle(input.metric.title);
  const submittedAt = addHoursIso(-4);
  const id = createStableUuid("testd-objective-loot", `${objective.id}:${input.memberUser.userId}`);

  await db.delete(objectiveLoot).where(eq(objectiveLoot.objectiveId, objective.id));
  await db.insert(objectiveLoot).values({
    id,
    teamId: objective.teamId,
    objectiveId: objective.id,
    submittedBy: input.memberUser.name,
    submittedByUserId: input.memberUser.userId,
    body: input.finalLoot.body,
    resultClaims: [
      {
        resultId: metric.id,
        claim: input.metric.claim,
        evidenceText: input.metric.finalEvidence,
      },
    ],
    selfTestReportUrl: null,
    selfTestReportBody: input.finalLoot.selfTestReportBody,
    submittedAt,
  });

  await db.update(objectives).set({ lootSubmittedAt: submittedAt, updatedAt: today() }).where(eq(objectives.id, objective.id));
  return objectiveLootByTarget(input.target);
}

export async function prepareCompletedAcceptanceReview(input: {
  target: AcceptedObjectiveTargetData;
  metric: MetricData;
  acceptanceResult: ObjectiveAcceptedResult;
  reason: string;
  adminUser: TestUserAccountRecord;
}) {
  const objective = await requiredObjectiveByTitle(input.target.title);
  const metric = await requiredMetricByTitle(input.metric.title);
  const loot = await requiredObjectiveLootByTarget(input.target);
  await db.delete(objectiveAcceptanceReviews).where(eq(objectiveAcceptanceReviews.objectiveId, objective.id));
  await db.insert(objectiveAcceptanceReviews).values({
    id: createStableUuid("testd-acceptance-review", `${objective.id}:${input.adminUser.userId}`),
    teamId: objective.teamId,
    objectiveId: objective.id,
    lootId: loot.id,
    reviewerUserId: input.adminUser.userId,
    acceptedResult: input.acceptanceResult,
    resultReviews: [{ resultId: metric.id, acceptedResult: input.metric.acceptedResult }],
    reason: input.reason,
    reviewedAt: addHoursIso(-2),
  });
}

export async function deleteFinalSettlementEventsByTarget(target: AcceptedObjectiveTargetData) {
  const objective = await objectiveByTitle(target.title);
  if (!objective) return;
  await db
    .delete(objectiveSettlementEvents)
    .where(and(eq(objectiveSettlementEvents.objectiveId, objective.id), eq(objectiveSettlementEvents.kind, "finalCompletion")));
}

export async function objectiveHasStageAndFlowStatus(target: AcceptedObjectiveTargetData) {
  const row = await objectiveByTitle(target.title);
  return row?.stage === target.stage && row.flowStatus === target.flowStatus;
}

export async function objectiveChallengerContains(input: {
  target: AcceptedObjectiveTargetData;
  memberUser: TestUserAccountRecord;
}) {
  const row = await objectiveByTitle(input.target.title);
  return Boolean(row?.challengerUserIds.includes(input.memberUser.userId));
}

export async function objectiveAcceptedAtExists(target: AcceptedObjectiveTargetData) {
  const row = await objectiveByTitle(target.title);
  return typeof row?.acceptedAt === "string" && row.acceptedAt.length > 0;
}

export async function objectiveAcceptedResultEquals(input: {
  target: AcceptedObjectiveTargetData;
  acceptanceResult: ObjectiveAcceptedResult;
}) {
  const row = await objectiveByTitle(input.target.title);
  return row?.acceptedResult === input.acceptanceResult;
}

export async function metricExistsAccepted(input: {
  target: AcceptedObjectiveTargetData;
  title: string;
  difficulty: UncertaintyLevel;
  score: number;
  acceptedResult: ResultAcceptedResult;
}) {
  const objective = await objectiveByTitle(input.target.title);
  if (!objective) return false;
  const row = await metricByTitle(input.title);
  return (
    row?.objectiveId === objective.id &&
    row.uncertaintyLevel === input.difficulty &&
    row.uncertaintyScore === input.score &&
    row.acceptedResult === input.acceptedResult
  );
}

export async function objectiveLootExists(input: {
  target: AcceptedObjectiveTargetData;
  finalLoot: FinalLootData;
  memberUser: TestUserAccountRecord;
}) {
  const loot = await objectiveLootByTarget(input.target);
  return (
    loot?.submittedByUserId === input.memberUser.userId &&
    loot.submittedBy === input.memberUser.name &&
    loot.body === input.finalLoot.body
  );
}

export async function acceptanceReviewExists(input: {
  target: AcceptedObjectiveTargetData;
  metric: MetricData;
  acceptanceResult: ObjectiveAcceptedResult;
  reason?: string;
  adminUser: TestUserAccountRecord;
}) {
  const review = await acceptanceReviewByTarget(input.target);
  const metric = await metricByTitle(input.metric.title);
  if (!review || !metric) return false;
  return (
    review.reviewerUserId === input.adminUser.userId &&
    review.acceptedResult === input.acceptanceResult &&
    (input.reason === undefined || review.reason === input.reason) &&
    review.resultReviews.some((item) => item.resultId === metric.id && item.acceptedResult === input.metric.acceptedResult)
  );
}

export async function finalSettlementEventCount(target: AcceptedObjectiveTargetData) {
  const objective = await objectiveByTitle(target.title);
  if (!objective) return 0;
  const rows = await db
    .select({ id: objectiveSettlementEvents.id })
    .from(objectiveSettlementEvents)
    .where(and(eq(objectiveSettlementEvents.objectiveId, objective.id), eq(objectiveSettlementEvents.kind, "finalCompletion")));
  return rows.length;
}

export async function clearMyLocalSettlementDraft(page: Page, target: AcceptedObjectiveTargetData) {
  const objective = await requiredObjectiveByTitle(target.title);
  const response = await page.evaluate(async (objectiveId) => {
    const result = await fetch(`/api/local-settlement/objectives/${encodeURIComponent(objectiveId)}/reviews/draft`, {
      credentials: "include",
      method: "DELETE",
    });
    return {
      body: await result.text(),
      status: result.status,
    };
  }, objective.id);
  if (response.status >= 400 && response.status !== 404) {
    throw new Error(`清理匿名互评草稿失败: ${response.status} ${response.body}`);
  }
}

export async function myLocalSettlementReviewEmpty(page: Page, target: AcceptedObjectiveTargetData) {
  const payload = await readMyLocalSettlementReview(page, target);
  return payload.review === null;
}

export async function myLocalSettlementDraftEmpty(page: Page, target: AcceptedObjectiveTargetData) {
  const payload = await readMyLocalSettlementReview(page, target);
  return payload.draft === null;
}

export async function latestPeerReview(page: Page, target: AcceptedObjectiveTargetData) {
  const payload = await readMyLocalSettlementReview(page, target);
  return payload.review;
}

export async function latestPeerReviewForTarget(page: Page, target: AcceptedObjectiveTargetData) {
  const objective = await requiredObjectiveByTitle(target.title);
  const payload = await readMyLocalSettlementReview(page, target);
  return payload.objectiveId === objective.id ? payload.review : null;
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

export async function myChallengesObjectiveHasStageAndFlowStatus(page: Page, target: AcceptedObjectiveTargetData) {
  const data = await readMyChallenges(page);
  const objective = data.objectives.find((item) => item.title === target.title);
  return objective?.stage === target.stage && objective.flowStatus === target.flowStatus;
}

export async function openPeerReviewPage(page: Page, targetTitle: string) {
  const panel = objectivePanel(page, targetTitle);
  await expect(panel).toBeVisible();
  const action = panel.getByRole("link", { name: "提交匿名互评", exact: true });
  await expect(action).toBeVisible();
  await expect(action).toBeEnabled();
  await action.click();
}

export async function waitPeerReviewPageLoaded(page: Page, targetTitle: string) {
  await expect(page).toHaveURL(/\/tasks\/objectives\/[^/]+\/loot(?:[?#].*)?$/);
  await expect(page.getByRole("heading", { name: "提交匿名互评", exact: true })).toBeVisible();
  await expect(page.getByText(targetTitle, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "提交匿名互评", exact: true })).toBeVisible();
}

export async function fillMetricContributionPercent(page: Page, input: {
  memberName: string;
  metricTitle: string;
  percent: number;
}) {
  const field = page.getByLabel(`${input.metricTitle} ${input.memberName} 贡献百分比`, { exact: true });
  await expect(field).toBeVisible();
  await field.fill(String(input.percent));
  await expect(field).toHaveValue(String(input.percent));
}

export async function metricContributionRowTotalVisible(page: Page, input: {
  metricTitle: string;
  totalPercent: number;
}) {
  const row = page.locator("tr").filter({ hasText: input.metricTitle }).first();
  await expect(row).toBeVisible();
  await expect(row.getByText(`${input.totalPercent}%`, { exact: true })).toBeVisible();
}

export async function submitPeerReview(page: Page) {
  await observeToastMessages(page);
  const responsePromise = page.waitForResponse(
    (response) => response.request().method() === "POST" && response.url().includes("/api/local-settlement/") && response.url().includes("/reviews/submit"),
    { timeout: 20_000 },
  );
  const button = page.getByRole("button", { name: "提交匿名互评", exact: true });
  await expect(button).toBeEnabled();
  await button.click();
  const response = await responsePromise;
  if (!response.ok()) {
    throw new Error(`提交匿名互评接口失败: ${response.status()} ${response.url()}`);
  }
  await expect(page).toHaveURL(/\/tasks(?:[?#].*)?$/);
}

export function peerReviewIsScored(review: LocalSettlementReview | null) {
  return review?.status === "scored";
}

export function peerReviewReviewerEquals(review: LocalSettlementReview | null, memberUser: TestUserAccountRecord) {
  return review?.reviewer === memberUser.name && review.reviewerUserId === memberUser.userId;
}

export function peerReviewSubmittedAtExists(review: LocalSettlementReview | null) {
  return typeof review?.submittedAt === "string" && review.submittedAt.length > 0;
}

export function peerReviewContainsMetric(review: LocalSettlementReview | null, metric: MetricData) {
  if (review?.status !== "scored") return false;
  return (review.metricRows ?? []).some((row) => row.metricTitle === metric.title);
}

export function peerReviewMetricAllocationPercent(input: {
  memberUser: TestUserAccountRecord;
  metric: MetricData;
  percent: number;
  review: LocalSettlementReview | null;
}) {
  const row = peerReviewMetricRow(input.review, input.metric);
  return row?.allocations.some(
    (allocation) =>
      allocation.member === input.memberUser.name &&
      allocation.memberUserId === input.memberUser.userId &&
      allocation.percent === input.percent,
  ) ?? false;
}

export function peerReviewMetricAllocationTotal(input: {
  metric: MetricData;
  review: LocalSettlementReview | null;
  totalPercent: number;
}) {
  const row = peerReviewMetricRow(input.review, input.metric);
  if (!row) return false;
  const total = row.allocations.reduce((sum, allocation) => sum + allocation.percent, 0);
  return total === input.totalPercent;
}

async function readMyLocalSettlementReview(page: Page, target: AcceptedObjectiveTargetData): Promise<LocalSettlementReviewResponse> {
  const objective = await requiredObjectiveByTitle(target.title);
  return page.evaluate(async (objectiveId) => {
    const response = await fetch(`/api/local-settlement/objectives/${encodeURIComponent(objectiveId)}/reviews/me`, {
      credentials: "include",
    });
    if (!response.ok) {
      throw new Error(`读取当前成员匿名互评失败: ${response.status}`);
    }
    return response.json();
  }, objective.id);
}

async function objectiveLootByTarget(target: AcceptedObjectiveTargetData) {
  const objective = await objectiveByTitle(target.title);
  if (!objective) return null;
  const [row] = await db
    .select({
      id: objectiveLoot.id,
      submittedBy: objectiveLoot.submittedBy,
      submittedByUserId: objectiveLoot.submittedByUserId,
      body: objectiveLoot.body,
      resultClaims: objectiveLoot.resultClaims,
      selfTestReportBody: objectiveLoot.selfTestReportBody,
      submittedAt: objectiveLoot.submittedAt,
    })
    .from(objectiveLoot)
    .where(eq(objectiveLoot.objectiveId, objective.id))
    .limit(1);
  return row ?? null;
}

async function requiredObjectiveLootByTarget(target: AcceptedObjectiveTargetData) {
  const loot = await objectiveLootByTarget(target);
  if (!loot) {
    throw new Error(`目标战利品不存在: ${target.title}`);
  }
  return loot;
}

async function acceptanceReviewByTarget(target: AcceptedObjectiveTargetData) {
  const objective = await objectiveByTitle(target.title);
  if (!objective) return null;
  const [row] = await db
    .select({
      id: objectiveAcceptanceReviews.id,
      reviewerUserId: objectiveAcceptanceReviews.reviewerUserId,
      acceptedResult: objectiveAcceptanceReviews.acceptedResult,
      resultReviews: objectiveAcceptanceReviews.resultReviews,
      reason: objectiveAcceptanceReviews.reason,
      reviewedAt: objectiveAcceptanceReviews.reviewedAt,
    })
    .from(objectiveAcceptanceReviews)
    .where(eq(objectiveAcceptanceReviews.objectiveId, objective.id))
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
      acceptedAt: objectives.acceptedAt,
      acceptedResult: objectives.acceptedResult,
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
      acceptedResult: results.acceptedResult,
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

function peerReviewMetricRow(review: LocalSettlementReview | null, metric: MetricData) {
  if (review?.status !== "scored") return null;
  return (review.metricRows ?? []).find((row) => row.metricTitle === metric.title) ?? null;
}

export function expectedPeerReviewTotal(input: PeerReviewInputData) {
  return input.memberPercent + input.teammatePercent;
}

function hasClaim(claims: LootResultClaim[], expected: { resultId: string; claim: LootResultClaimStatus; evidenceText: string }) {
  return claims.some(
    (claim) =>
      claim.resultId === expected.resultId &&
      claim.claim === expected.claim &&
      claim.evidenceText === expected.evidenceText,
  );
}

export async function objectiveLootHasMetricClaim(input: {
  target: AcceptedObjectiveTargetData;
  metric: MetricData;
}) {
  const metric = await metricByTitle(input.metric.title);
  const loot = await objectiveLootByTarget(input.target);
  if (!metric || !loot) return false;
  return hasClaim(loot.resultClaims, {
    resultId: metric.id,
    claim: input.metric.claim,
    evidenceText: input.metric.finalEvidence,
  });
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
