import { expect, type Page } from "@playwright/test";
import { and, eq, ilike, inArray } from "drizzle-orm";
import { objectiveAcceptanceReviews, objectiveAlignmentRequests, objectiveLoot, objectives, results } from "../../../../../../server/db/schema";
import type {
  LootResultClaim,
  LootResultClaimStatus,
  ObjectiveAcceptedResult,
  ObjectiveAlignmentRequestKind,
  ObjectiveAlignmentRequestStatus,
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
  ChallengesApiData,
  FinalLootData,
  MetricData,
  ObjectiveTargetStateData,
  SubmittedObjectiveTargetData,
} from "./admin-accept-loot.context";

export async function loginAsAdmin(page: Page, input: { email: string; password: string }) {
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

export async function prepareSubmittedObjective(input: {
  adminUser: TestUserAccountRecord;
  memberUser: TestUserAccountRecord;
  target: SubmittedObjectiveTargetData;
}): Promise<TestObjectiveFixtureRecord> {
  const record = await upsertTestObjective({
    teamId: input.adminUser.teamId,
    title: input.target.title,
    stage: input.target.stage,
    flowStatus: input.target.flowStatus,
    status: "On Track",
    progress: 90,
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
      acceptedAt: null,
      acceptedResult: null,
      completionMultiplier: null,
      objectiveBasePoints: 0,
      confirmationDueAt: null,
      confirmedAt: addHoursIso(-24),
      lootSubmittedAt: addHoursIso(-2),
      updatedAt: today(),
      updatedBy: input.adminUser.userId,
    })
    .where(eq(objectives.id, record.id));

  return record;
}

export async function prepareCalibratedMetric(input: {
  target: ObjectiveTargetStateData;
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
    detail: "TestD admin accept loot metric fixture",
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

export async function prepareFinalObjectiveLoot(input: {
  target: ObjectiveTargetStateData;
  metric: MetricData;
  finalLoot: FinalLootData;
  memberUser: TestUserAccountRecord;
}) {
  const objective = await requiredObjectiveByTitle(input.target.title);
  const metric = await requiredMetricByTitle(input.metric.title);
  const submittedAt = addHoursIso(-1);
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

export async function prepareAcceptanceAlignmentRequest(input: {
  target: ObjectiveTargetStateData;
  kind: ObjectiveAlignmentRequestKind;
  status: ObjectiveAlignmentRequestStatus;
  note: string;
  memberUser: TestUserAccountRecord;
}) {
  const objective = await requiredObjectiveByTitle(input.target.title);
  await db
    .delete(objectiveAlignmentRequests)
    .where(and(eq(objectiveAlignmentRequests.objectiveId, objective.id), eq(objectiveAlignmentRequests.kind, input.kind)));

  const values = {
    id: createStableUuid("testd-objective-alignment-request", `${objective.id}:${input.kind}:${input.memberUser.userId}`),
    teamId: objective.teamId,
    objectiveId: objective.id,
    kind: input.kind,
    requestedBy: input.memberUser.name,
    requestedByUserId: input.memberUser.userId,
    status: input.status,
    proposedAt: addHoursIso(-1),
    scheduledAt: null,
    meetingRoom: null,
    note: input.note,
    confirmationDueAt: null,
    commanderFeedback: null,
    reviewedBy: null,
    reviewedByUserId: null,
    reviewedAt: null,
  };

  await db.insert(objectiveAlignmentRequests).values(values);
  return alignmentRequestByTarget({
    target: input.target,
    kind: input.kind,
    status: input.status,
    memberUser: input.memberUser,
  });
}

export async function deleteAcceptanceReviewsByTarget(target: ObjectiveTargetStateData) {
  const objective = await objectiveByTitle(target.title);
  if (!objective) return;
  await db.delete(objectiveAcceptanceReviews).where(eq(objectiveAcceptanceReviews.objectiveId, objective.id));
}

export async function objectiveHasStageAndFlowStatus(target: ObjectiveTargetStateData) {
  const row = await objectiveByTitle(target.title);
  return row?.stage === target.stage && row.flowStatus === target.flowStatus;
}

export async function objectiveChallengerContains(input: {
  target: ObjectiveTargetStateData;
  memberUser: TestUserAccountRecord;
}) {
  const row = await objectiveByTitle(input.target.title);
  return Boolean(row?.challengerUserIds.includes(input.memberUser.userId));
}

export async function objectiveConfirmedAtExists(target: ObjectiveTargetStateData) {
  const row = await objectiveByTitle(target.title);
  return typeof row?.confirmedAt === "string" && row.confirmedAt.length > 0;
}

export async function objectiveLootSubmittedAtExists(target: ObjectiveTargetStateData) {
  const row = await objectiveByTitle(target.title);
  return typeof row?.lootSubmittedAt === "string" && row.lootSubmittedAt.length > 0;
}

export async function objectiveAcceptedAtEmpty(target: ObjectiveTargetStateData) {
  const row = await objectiveByTitle(target.title);
  return row?.acceptedAt === null;
}

export async function objectiveAcceptedAtExists(target: ObjectiveTargetStateData) {
  const row = await objectiveByTitle(target.title);
  return typeof row?.acceptedAt === "string" && row.acceptedAt.length > 0;
}

export async function objectiveAcceptedResultEmpty(target: ObjectiveTargetStateData) {
  const row = await objectiveByTitle(target.title);
  return row?.acceptedResult === null;
}

export async function objectiveAcceptedResultEquals(input: {
  target: ObjectiveTargetStateData;
  acceptanceResult: ObjectiveAcceptedResult;
}) {
  const row = await objectiveByTitle(input.target.title);
  return row?.acceptedResult === input.acceptanceResult;
}

export async function metricExistsWithScore(input: {
  target: ObjectiveTargetStateData;
  title: string;
  difficulty: UncertaintyLevel;
  score: number;
}) {
  const objective = await objectiveByTitle(input.target.title);
  if (!objective) return false;
  const row = await metricByTitle(input.title);
  return row?.objectiveId === objective.id && row.uncertaintyLevel === input.difficulty && row.uncertaintyScore === input.score;
}

export async function metricAcceptedResultEmpty(title: string) {
  const row = await metricByTitle(title);
  return row?.acceptedResult === "unreviewed";
}

export async function metricAcceptedResultEquals(input: {
  title: string;
  acceptedResult: ResultAcceptedResult;
}) {
  const row = await metricByTitle(input.title);
  return row?.acceptedResult === input.acceptedResult;
}

export async function objectiveLootExists(input: {
  target: ObjectiveTargetStateData;
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

export async function objectiveLootHasSelfTest(input: {
  target: ObjectiveTargetStateData;
  selfTestReportBody: string;
}) {
  const loot = await objectiveLootByTarget(input.target);
  return loot?.selfTestReportBody === input.selfTestReportBody;
}

export async function objectiveLootHasMetricClaim(input: {
  target: ObjectiveTargetStateData;
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

export async function openAlignmentRequestCount(input: {
  target: ObjectiveTargetStateData;
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
  target: ObjectiveTargetStateData;
  kind: ObjectiveAlignmentRequestKind;
  status: ObjectiveAlignmentRequestStatus;
  memberUser: TestUserAccountRecord;
}) {
  const request = await alignmentRequestByTarget(input);
  return Boolean(request);
}

export async function completedAlignmentRequestExists(input: {
  target: ObjectiveTargetStateData;
  kind: ObjectiveAlignmentRequestKind;
  status: ObjectiveAlignmentRequestStatus;
  feedback: string;
  adminUser: TestUserAccountRecord;
}) {
  const objective = await objectiveByTitle(input.target.title);
  if (!objective) return false;
  const [row] = await db
    .select({ id: objectiveAlignmentRequests.id })
    .from(objectiveAlignmentRequests)
    .where(
      and(
        eq(objectiveAlignmentRequests.objectiveId, objective.id),
        eq(objectiveAlignmentRequests.kind, input.kind),
        eq(objectiveAlignmentRequests.status, input.status),
        eq(objectiveAlignmentRequests.commanderFeedback, input.feedback),
        eq(objectiveAlignmentRequests.reviewedByUserId, input.adminUser.userId),
      ),
    )
    .limit(1);
  return Boolean(row);
}

export async function acceptanceReviewCount(target: ObjectiveTargetStateData) {
  const objective = await objectiveByTitle(target.title);
  if (!objective) return 0;
  const rows = await db.select({ id: objectiveAcceptanceReviews.id }).from(objectiveAcceptanceReviews).where(eq(objectiveAcceptanceReviews.objectiveId, objective.id));
  return rows.length;
}

export async function acceptanceReviewExists(input: {
  target: ObjectiveTargetStateData;
  metric: MetricData;
  acceptanceResult: ObjectiveAcceptedResult;
  reason: string;
  adminUser: TestUserAccountRecord;
}) {
  const review = await acceptanceReviewByTarget(input.target);
  const metric = await metricByTitle(input.metric.title);
  if (!review || !metric) return false;
  return (
    review.reviewerUserId === input.adminUser.userId &&
    review.acceptedResult === input.acceptanceResult &&
    review.reason === input.reason &&
    review.resultReviews.some((item) => item.resultId === metric.id && item.acceptedResult === input.metric.acceptedResult)
  );
}

export async function acceptanceReviewHasMetricResult(input: {
  target: ObjectiveTargetStateData;
  metric: MetricData;
}) {
  const review = await acceptanceReviewByTarget(input.target);
  const metric = await metricByTitle(input.metric.title);
  if (!review || !metric) return false;
  return review.resultReviews.some((item) => item.resultId === metric.id && item.acceptedResult === input.metric.acceptedResult);
}

export async function openAcceptanceReviewPageFromAlignment(page: Page, input: { targetTitle: string }) {
  await expect(challengeScopeTab(page, "所有挑战")).toHaveClass(/orf-scope-tab-active/);
  const panel = objectivePanel(page, input.targetTitle);
  await expect(panel).toBeVisible();
  const action = panel.getByRole("link", { name: "去验收", exact: true });
  await expect(action).toBeVisible();
  await action.click();
}

export async function waitAcceptanceReviewPageLoaded(page: Page, input: { targetTitle: string }) {
  await expect(page).toHaveURL(/\/tasks\/objectives\/[^/]+\/loot(?:[?#].*)?$/);
  await expect(page.getByRole("heading", { name: "验收战利品" })).toBeVisible();
  await expect(page.getByText(input.targetTitle, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "确认验收通过", exact: true })).toBeVisible();
}

export async function selectMetricAcceptanceResult(page: Page, input: { metricTitle: string; resultLabel: string }) {
  const button = page.getByRole("button", { name: `${input.metricTitle} 验收结论`, exact: true });
  await expect(button).toBeVisible();
  await button.click();
  const option = page.getByRole("option", { name: input.resultLabel, exact: true });
  await expect(option).toBeVisible();
  await option.click();
  await expect(button).toContainText(input.resultLabel);
}

export async function fillAcceptanceReason(page: Page, reason: string) {
  const input = page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: "确认验收通过", exact: true }) })
    .locator("textarea")
    .first();
  await expect(input).toBeVisible({ timeout: 15_000 });
  await input.fill(reason);
  await expect(input).toHaveValue(reason);
}

export async function submitAcceptanceReview(page: Page, input: {
  acceptedTarget: ObjectiveTargetStateData;
  metric: MetricData;
  acceptanceResult: ObjectiveAcceptedResult;
  reviewReason: string;
  alignmentFeedback: string;
  adminUser: TestUserAccountRecord;
}) {
  await observeToastMessages(page);
  const responsePromise = page.waitForResponse(
    (response) => response.request().method() === "POST" && response.url().includes("/review"),
  );
  const button = page.getByRole("button", { name: "确认验收通过", exact: true });
  await expect(button).toBeEnabled();
  await button.click();
  const response = await responsePromiseOrNull(responsePromise);
  if (response && !response.ok()) {
    throw new Error(`提交战利品验收接口失败: ${response.status()} ${response.url()}`);
  }
  await expect
    .poll(
      async () =>
        (await allChallengesObjectiveHasStageAndFlowStatus(page, input.acceptedTarget)) ||
        (await objectiveHasStageAndFlowStatus(input.acceptedTarget)),
      { timeout: 20_000 },
    )
    .toBe(true);
  await expect
    .poll(
      async () =>
        (await allChallengesContainsAcceptanceReview(page, {
          targetTitle: input.acceptedTarget.title,
          metric: input.metric,
          acceptanceResult: input.acceptanceResult,
          reason: input.reviewReason,
          adminUser: input.adminUser,
        })) ||
        (await acceptanceReviewExists({
          target: input.acceptedTarget,
          metric: input.metric,
          acceptanceResult: input.acceptanceResult,
          reason: input.reviewReason,
          adminUser: input.adminUser,
        })),
      { timeout: 20_000 },
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

export async function allChallengesObjectiveHasStageAndFlowStatus(page: Page, target: ObjectiveTargetStateData) {
  const data = await readAllChallenges(page);
  const objective = data.objectives.find((item) => item.title === target.title);
  return objective?.stage === target.stage && objective.flowStatus === target.flowStatus;
}

export async function allChallengesObjectiveAcceptedAtExists(page: Page, title: string) {
  const data = await readAllChallenges(page);
  const objective = data.objectives.find((item) => item.title === title);
  return typeof objective?.acceptedAt === "string" && objective.acceptedAt.length > 0;
}

export async function allChallengesObjectiveAcceptedResult(page: Page, input: {
  title: string;
  acceptanceResult: ObjectiveAcceptedResult;
}) {
  const data = await readAllChallenges(page);
  const objective = data.objectives.find((item) => item.title === input.title);
  return objective?.acceptedResult === input.acceptanceResult;
}

export async function allChallengesContainsAcceptanceReview(page: Page, input: {
  targetTitle: string;
  metric: MetricData;
  acceptanceResult: ObjectiveAcceptedResult;
  reason: string;
  adminUser: TestUserAccountRecord;
}) {
  const data = await readAllChallenges(page);
  const objective = data.objectives.find((item) => item.title === input.targetTitle);
  const metric = data.results.find((item) => item.objectiveId === objective?.id && item.title === input.metric.title);
  if (!objective || !metric) return false;
  return data.objectiveAcceptanceReviews.some(
    (review) =>
      review.objectiveId === objective.id &&
      review.reviewerUserId === input.adminUser.userId &&
      review.acceptedResult === input.acceptanceResult &&
      review.reason === input.reason &&
      review.resultReviews.some((item) => item.resultId === metric.id && item.acceptedResult === input.metric.acceptedResult),
  );
}

export async function allChallengesContainsCompletedAlignmentRequest(page: Page, input: {
  targetTitle: string;
  kind: ObjectiveAlignmentRequestKind;
  status: ObjectiveAlignmentRequestStatus;
  feedback: string;
  adminUser: TestUserAccountRecord;
}) {
  const data = await readAllChallenges(page);
  const objective = data.objectives.find((item) => item.title === input.targetTitle);
  if (!objective) return false;
  return data.objectiveAlignmentRequests.some(
    (request) =>
      request.objectiveId === objective.id &&
      request.kind === input.kind &&
      request.status === input.status &&
      request.commanderFeedback === input.feedback &&
      request.reviewedByUserId === input.adminUser.userId,
  );
}

async function acceptanceReviewByTarget(target: ObjectiveTargetStateData) {
  const objective = await objectiveByTitle(target.title);
  if (!objective) return null;
  const [row] = await db
    .select({
      id: objectiveAcceptanceReviews.id,
      objectiveId: objectiveAcceptanceReviews.objectiveId,
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

async function alignmentRequestByTarget(input: {
  target: ObjectiveTargetStateData;
  kind: ObjectiveAlignmentRequestKind;
  status: ObjectiveAlignmentRequestStatus;
  memberUser: TestUserAccountRecord;
}) {
  const objective = await objectiveByTitle(input.target.title);
  if (!objective) return null;
  const [row] = await db
    .select({
      id: objectiveAlignmentRequests.id,
      proposedAt: objectiveAlignmentRequests.proposedAt,
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
  return row ?? null;
}

async function objectiveLootByTarget(target: ObjectiveTargetStateData) {
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
      id: results.id,
      objectiveId: results.objectiveId,
      title: results.title,
      uncertaintyLevel: results.uncertaintyLevel,
      uncertaintyScore: results.uncertaintyScore,
      acceptedResult: results.acceptedResult,
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
