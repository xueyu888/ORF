import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import { and, eq, ilike } from "drizzle-orm";
import {
  objectiveAcceptanceReviews,
  objectiveLoot,
  objectiveSettlementEvents,
  objectives,
  pointLedger,
  results,
} from "../../../../../../server/db/schema";
import type {
  LootResultClaim,
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
  ChallengeApiSettlementEvent,
  ChallengesApiData,
  FinalLootData,
  MetricData,
  ObjectiveTargetStateData,
  SettlementData,
  SettledObjectiveTargetData,
} from "./admin-settle-loot.context";

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
          body: await sessionResponse.json(),
          status: sessionResponse.status,
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
      characterData: true,
      childList: true,
      subtree: true,
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
      body: await sessionResponse.json().catch(() => ({})),
      status: sessionResponse.status,
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

export async function prepareAcceptedObjective(input: {
  adminUser: TestUserAccountRecord;
  memberUser: TestUserAccountRecord;
  settlement: SettlementData;
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
      acceptedResult: "completed",
      completionMultiplier: input.settlement.completionMultiplier,
      confirmedAt: addHoursIso(-72),
      lootSubmittedAt: addHoursIso(-4),
      objectiveBasePoints: input.settlement.basePoints,
      objectiveSettlementPoints: null,
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
  memberUser: TestUserAccountRecord;
  metric: MetricData;
  target: AcceptedObjectiveTargetData;
}) {
  const objective = await requiredObjectiveByTitle(input.target.title);
  const id = createStableUuid("testd-result", `${objective.id}:${input.metric.title}`);
  const values = {
    baseline: 0,
    confidence: 90,
    createdAt: today(),
    createdBy: input.memberUser.userId,
    current: 100,
    definer: input.memberUser.name,
    definerUserId: input.memberUser.userId,
    detail: "TestD admin settle loot metric fixture",
    direction: "increase" as const,
    id,
    objectiveId: objective.id,
    reviewCadence: "Weekly",
    source: "memberProposed" as const,
    sortOrder: 0,
    status: "Draft" as const,
    target: 100,
    teamId: objective.teamId,
    title: input.metric.title,
    uncertaintyLevel: input.metric.difficulty,
    uncertaintyScore: input.metric.score,
    unit: "%",
    updatedAt: today(),
    updatedBy: input.memberUser.userId,
    acceptedResult: input.metric.acceptedResult,
  };

  await db
    .insert(results)
    .values(values)
    .onConflictDoUpdate({
      target: results.id,
      set: {
        acceptedResult: values.acceptedResult,
        baseline: values.baseline,
        confidence: values.confidence,
        createdBy: values.createdBy,
        current: values.current,
        definer: values.definer,
        definerUserId: values.definerUserId,
        detail: values.detail,
        direction: values.direction,
        objectiveId: values.objectiveId,
        reviewCadence: values.reviewCadence,
        source: values.source,
        sortOrder: values.sortOrder,
        status: values.status,
        target: values.target,
        teamId: values.teamId,
        title: values.title,
        uncertaintyLevel: values.uncertaintyLevel,
        uncertaintyScore: values.uncertaintyScore,
        unit: values.unit,
        updatedAt: values.updatedAt,
        updatedBy: values.updatedBy,
      },
    });

  return metricByTitle(input.metric.title);
}

export async function prepareFinalObjectiveLoot(input: {
  finalLoot: FinalLootData;
  memberUser: TestUserAccountRecord;
  metric: MetricData;
  target: AcceptedObjectiveTargetData;
}) {
  const objective = await requiredObjectiveByTitle(input.target.title);
  const metric = await requiredMetricByTitle(input.metric.title);
  const submittedAt = addHoursIso(-4);
  const id = createStableUuid("testd-objective-loot", `${objective.id}:${input.memberUser.userId}`);

  await db.delete(objectiveLoot).where(eq(objectiveLoot.objectiveId, objective.id));
  await db.insert(objectiveLoot).values({
    body: input.finalLoot.body,
    id,
    objectiveId: objective.id,
    resultClaims: [
      {
        claim: input.metric.claim,
        evidenceText: input.metric.finalEvidence,
        resultId: metric.id,
      },
    ],
    selfTestReportBody: input.finalLoot.selfTestReportBody,
    selfTestReportUrl: null,
    submittedAt,
    submittedBy: input.memberUser.name,
    submittedByUserId: input.memberUser.userId,
    teamId: objective.teamId,
  });

  await db.update(objectives).set({ lootSubmittedAt: submittedAt, updatedAt: today() }).where(eq(objectives.id, objective.id));
  return objectiveLootByTarget(input.target);
}

export async function prepareCompletedAcceptanceReview(input: {
  acceptanceResult: ObjectiveAcceptedResult;
  adminUser: TestUserAccountRecord;
  metric: MetricData;
  reason: string;
  target: AcceptedObjectiveTargetData;
}) {
  const objective = await requiredObjectiveByTitle(input.target.title);
  const metric = await requiredMetricByTitle(input.metric.title);
  const loot = await requiredObjectiveLootByTarget(input.target);

  await db.delete(objectiveAcceptanceReviews).where(eq(objectiveAcceptanceReviews.objectiveId, objective.id));
  await db.insert(objectiveAcceptanceReviews).values({
    acceptedResult: input.acceptanceResult,
    id: createStableUuid("testd-acceptance-review", `${objective.id}:${input.adminUser.userId}`),
    lootId: loot.id,
    objectiveId: objective.id,
    reason: input.reason,
    resultReviews: [{ acceptedResult: input.metric.acceptedResult, resultId: metric.id }],
    reviewedAt: addHoursIso(-2),
    reviewerUserId: input.adminUser.userId,
    teamId: objective.teamId,
  });
}

export async function deleteFinalSettlementEventsByTarget(target: AcceptedObjectiveTargetData) {
  const objective = await objectiveByTitle(target.title);
  if (!objective) return;
  await db
    .delete(objectiveSettlementEvents)
    .where(and(eq(objectiveSettlementEvents.objectiveId, objective.id), eq(objectiveSettlementEvents.kind, "finalCompletion")));
}

export async function deletePointLedgerByTarget(target: AcceptedObjectiveTargetData) {
  const objective = await objectiveByTitle(target.title);
  if (!objective) return;
  await db.delete(pointLedger).where(eq(pointLedger.objectiveId, objective.id));
}

export async function objectiveHasStageAndFlowStatus(target: ObjectiveTargetStateData) {
  const row = await objectiveByTitle(target.title);
  return row?.stage === target.stage && row.flowStatus === target.flowStatus;
}

export async function objectiveOnlyChallenger(input: {
  memberUser: TestUserAccountRecord;
  target: AcceptedObjectiveTargetData;
}) {
  const row = await objectiveByTitle(input.target.title);
  return row?.challengerUserIds.length === 1 && row.challengerUserIds[0] === input.memberUser.userId;
}

export async function objectiveChallengerContains(input: {
  memberUser: TestUserAccountRecord;
  target: ObjectiveTargetStateData;
}) {
  const row = await objectiveByTitle(input.target.title);
  return Boolean(row?.challengerUserIds.includes(input.memberUser.userId));
}

export async function objectiveAcceptedAtExists(target: ObjectiveTargetStateData) {
  const row = await objectiveByTitle(target.title);
  return typeof row?.acceptedAt === "string" && row.acceptedAt.length > 0;
}

export async function objectiveAcceptedResultEquals(input: {
  acceptanceResult: ObjectiveAcceptedResult;
  target: ObjectiveTargetStateData;
}) {
  const row = await objectiveByTitle(input.target.title);
  return row?.acceptedResult === input.acceptanceResult;
}

export async function objectiveBasePointsEquals(input: {
  points: number;
  target: ObjectiveTargetStateData;
}) {
  const row = await objectiveByTitle(input.target.title);
  return row?.objectiveBasePoints === input.points;
}

export async function objectiveSettlementPointsEmpty(target: AcceptedObjectiveTargetData) {
  const row = await objectiveByTitle(target.title);
  return row?.objectiveSettlementPoints === null;
}

export async function objectiveSettlementPointsEquals(input: {
  points: number;
  target: ObjectiveTargetStateData;
}) {
  const row = await objectiveByTitle(input.target.title);
  return numberEquals(row?.objectiveSettlementPoints, input.points);
}

export async function objectiveCompletionMultiplierEquals(input: {
  multiplier: number;
  target: SettledObjectiveTargetData;
}) {
  const row = await objectiveByTitle(input.target.title);
  return numberEquals(row?.completionMultiplier, input.multiplier);
}

export async function metricExistsAccepted(input: {
  acceptedResult: ResultAcceptedResult;
  difficulty: UncertaintyLevel;
  score: number;
  target: ObjectiveTargetStateData;
  title: string;
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

export async function metricAcceptedResultEquals(input: {
  acceptedResult: ResultAcceptedResult;
  title: string;
}) {
  const row = await metricByTitle(input.title);
  return row?.acceptedResult === input.acceptedResult;
}

export async function objectiveLootExists(input: {
  finalLoot: FinalLootData;
  memberUser: TestUserAccountRecord;
  target: ObjectiveTargetStateData;
}) {
  const loot = await objectiveLootByTarget(input.target);
  return (
    loot?.submittedByUserId === input.memberUser.userId &&
    loot.submittedBy === input.memberUser.name &&
    loot.body === input.finalLoot.body
  );
}

export async function acceptanceReviewExists(input: {
  acceptanceResult: ObjectiveAcceptedResult;
  adminUser: TestUserAccountRecord;
  metric: MetricData;
  reason?: string;
  target: ObjectiveTargetStateData;
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

export async function finalSettlementEventCount(target: ObjectiveTargetStateData) {
  const objective = await objectiveByTitle(target.title);
  if (!objective) return 0;
  const rows = await db
    .select({ id: objectiveSettlementEvents.id })
    .from(objectiveSettlementEvents)
    .where(and(eq(objectiveSettlementEvents.objectiveId, objective.id), eq(objectiveSettlementEvents.kind, "finalCompletion")));
  return rows.length;
}

export async function pointLedgerCount(target: ObjectiveTargetStateData) {
  const objective = await objectiveByTitle(target.title);
  if (!objective) return 0;
  const rows = await db.select({ id: pointLedger.id }).from(pointLedger).where(eq(pointLedger.objectiveId, objective.id));
  return rows.length;
}

export async function finalSettlementEventExists(input: {
  adminUser: TestUserAccountRecord;
  settlement: SettlementData;
  target: ObjectiveTargetStateData;
}) {
  return (await finalSettlementEventByTarget(input.target, input.settlement, input.adminUser)) !== null;
}

export async function pointLedgerExistsForFinalSettlement(input: {
  memberUser: TestUserAccountRecord;
  settlement: SettlementData;
  target: ObjectiveTargetStateData;
}) {
  const objective = await objectiveByTitle(input.target.title);
  if (!objective) return false;
  const event = await finalSettlementEventByTarget(input.target, input.settlement);
  if (!event) return false;
  const [row] = await db
    .select({
      memberName: pointLedger.memberName,
      points: pointLedger.points,
      reason: pointLedger.reason,
      settlementEventId: pointLedger.settlementEventId,
      userId: pointLedger.userId,
    })
    .from(pointLedger)
    .where(
      and(
        eq(pointLedger.objectiveId, objective.id),
        eq(pointLedger.userId, input.memberUser.userId),
        eq(pointLedger.settlementEventId, event.id),
      ),
    )
    .limit(1);
  return (
    row?.memberName === input.memberUser.name &&
    numberEquals(row.points, input.settlement.settlementPoints) &&
    row.reason === input.settlement.reason
  );
}

export async function latestFinalSettlementEvent(input: {
  adminUser: TestUserAccountRecord;
  settlement: SettlementData;
  target: ObjectiveTargetStateData;
}) {
  return finalSettlementEventByTarget(input.target, input.settlement, input.adminUser);
}

export async function openSettlementPage(page: Page, targetTitle: string) {
  await expect(challengeScopeTab(page, "所有挑战")).toHaveClass(/orf-scope-tab-active/);
  const panel = objectivePanel(page, targetTitle);
  await expect(panel).toBeVisible();
  const action = panel.getByRole("link", { name: "去结算", exact: true });
  await expect(action).toBeVisible();
  await expect(action).toBeEnabled();
  await action.click();
}

export async function waitSettlementPageLoaded(page: Page, targetTitle: string) {
  await expect(page).toHaveURL(/\/tasks\/objectives\/[^/]+\/loot(?:[?#].*)?$/);
  await expect(page.getByRole("heading", { name: "确认结算", exact: true })).toBeVisible();
  await expect(page.getByText(targetTitle, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "确认结算", exact: true })).toBeVisible();
}

export async function singleContributionRatioVisible(page: Page, input: {
  memberName: string;
  percent: string;
}) {
  const summary = page.locator(".orf-loot-single-summary").first();
  await expect(summary).toBeVisible();
  await expect(summary).toContainText(input.memberName);
  await expect(summary).toContainText(input.percent);
}

export async function submitSettlement(page: Page, input: {
  settledTarget: SettledObjectiveTargetData;
  settlement: SettlementData;
}) {
  await observeToastMessages(page);
  const responsePromise = page.waitForResponse(
    (response) => response.request().method() === "POST" && response.url().includes("/settle"),
    { timeout: 20_000 },
  );
  const button = page.getByRole("button", { name: "确认结算", exact: true });
  await expect(button).toBeEnabled();
  await button.click();
  const response = await responsePromise;
  if (!response.ok()) {
    throw new Error(`提交目标结算接口失败: ${response.status()} ${response.url()}`);
  }
  await expect(page).toHaveURL(/\/reports(?:[?#].*)?$/);
  await expect
    .poll(
      async () =>
        (await allChallengesObjectiveHasStageAndFlowStatus(page, input.settledTarget)) ||
        (await objectiveHasStageAndFlowStatus(input.settledTarget)),
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

export async function allChallengesObjectiveAcceptedResult(input: {
  acceptanceResult: ObjectiveAcceptedResult;
  page: Page;
  title: string;
}) {
  const data = await readAllChallenges(input.page);
  const objective = data.objectives.find((item) => item.title === input.title);
  return objective?.acceptedResult === input.acceptanceResult;
}

export async function allChallengesObjectiveBasePoints(input: {
  page: Page;
  points: number;
  title: string;
}) {
  const data = await readAllChallenges(input.page);
  const objective = data.objectives.find((item) => item.title === input.title);
  return objective?.objectiveBasePoints === input.points;
}

export async function allChallengesObjectiveSettlementPoints(input: {
  page: Page;
  points: number;
  title: string;
}) {
  const data = await readAllChallenges(input.page);
  const objective = data.objectives.find((item) => item.title === input.title);
  return numberEquals(objective?.objectiveSettlementPoints, input.points);
}

export async function allChallengesContainsFinalSettlementEvent(input: {
  adminUser: TestUserAccountRecord;
  page: Page;
  settlement: SettlementData;
  target: ObjectiveTargetStateData;
}) {
  const data = await readAllChallenges(input.page);
  const objective = data.objectives.find((item) => item.title === input.target.title);
  if (!objective) return false;
  return data.objectiveSettlementEvents.some((event) =>
    settlementEventMatches({
      adminUser: input.adminUser,
      event,
      objectiveId: objective.id,
      settlement: input.settlement,
    }),
  );
}

export async function allChallengesContainsPointLedger(input: {
  memberUser: TestUserAccountRecord;
  page: Page;
  settlement: SettlementData;
  target: ObjectiveTargetStateData;
}) {
  const data = await readAllChallenges(input.page);
  const objective = data.objectives.find((item) => item.title === input.target.title);
  if (!objective) return false;
  const event = data.objectiveSettlementEvents.find((item) =>
    item.objectiveId === objective.id &&
    item.kind === input.settlement.eventKind &&
    numberEquals(item.settlementPoints, input.settlement.settlementPoints)
  );
  if (!event) return false;
  return data.pointLedger.some((item) =>
    item.objectiveId === objective.id &&
    item.settlementEventId === event.id &&
    item.userId === input.memberUser.userId &&
    item.memberName === input.memberUser.name &&
    numberEquals(item.points, input.settlement.settlementPoints) &&
    item.reason === input.settlement.reason
  );
}

async function finalSettlementEventByTarget(
  target: ObjectiveTargetStateData,
  settlement: SettlementData,
  adminUser?: TestUserAccountRecord,
) {
  const objective = await objectiveByTitle(target.title);
  if (!objective) return null;
  const rows = await db
    .select({
      basePoints: objectiveSettlementEvents.basePoints,
      createdByUserId: objectiveSettlementEvents.createdByUserId,
      id: objectiveSettlementEvents.id,
      kind: objectiveSettlementEvents.kind,
      multiplier: objectiveSettlementEvents.multiplier,
      objectiveId: objectiveSettlementEvents.objectiveId,
      reason: objectiveSettlementEvents.reason,
      settlementPoints: objectiveSettlementEvents.settlementPoints,
    })
    .from(objectiveSettlementEvents)
    .where(and(eq(objectiveSettlementEvents.objectiveId, objective.id), eq(objectiveSettlementEvents.kind, settlement.eventKind)))
    .limit(1);
  const event = rows[0] ?? null;
  if (!event) return null;
  if (
    !settlementEventMatches({
      adminUser,
      event,
      objectiveId: objective.id,
      settlement,
    })
  ) {
    return null;
  }
  return event;
}

function settlementEventMatches(input: {
  adminUser?: TestUserAccountRecord;
  event: Pick<ChallengeApiSettlementEvent, "basePoints" | "createdByUserId" | "kind" | "multiplier" | "objectiveId" | "reason" | "settlementPoints">;
  objectiveId: string;
  settlement: SettlementData;
}) {
  return (
    input.event.objectiveId === input.objectiveId &&
    input.event.kind === input.settlement.eventKind &&
    numberEquals(input.event.basePoints, input.settlement.basePoints) &&
    numberEquals(input.event.multiplier, input.settlement.completionMultiplier) &&
    numberEquals(input.event.settlementPoints, input.settlement.settlementPoints) &&
    input.event.reason === input.settlement.reason &&
    (!input.adminUser || input.event.createdByUserId === input.adminUser.userId)
  );
}

async function objectiveByTitle(title: string) {
  const [row] = await db
    .select({
      acceptedAt: objectives.acceptedAt,
      acceptedResult: objectives.acceptedResult,
      challengerUserIds: objectives.challengerUserIds,
      completionMultiplier: objectives.completionMultiplier,
      flowStatus: objectives.flowStatus,
      id: objectives.id,
      objectiveBasePoints: objectives.objectiveBasePoints,
      objectiveSettlementPoints: objectives.objectiveSettlementPoints,
      stage: objectives.stage,
      teamId: objectives.teamId,
      title: objectives.title,
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

async function objectiveLootByTarget(target: ObjectiveTargetStateData) {
  const objective = await objectiveByTitle(target.title);
  if (!objective) return null;
  const [row] = await db
    .select({
      body: objectiveLoot.body,
      id: objectiveLoot.id,
      resultClaims: objectiveLoot.resultClaims,
      selfTestReportBody: objectiveLoot.selfTestReportBody,
      submittedAt: objectiveLoot.submittedAt,
      submittedBy: objectiveLoot.submittedBy,
      submittedByUserId: objectiveLoot.submittedByUserId,
    })
    .from(objectiveLoot)
    .where(eq(objectiveLoot.objectiveId, objective.id))
    .limit(1);
  return row ?? null;
}

async function requiredObjectiveLootByTarget(target: ObjectiveTargetStateData) {
  const loot = await objectiveLootByTarget(target);
  if (!loot) {
    throw new Error(`目标战利品不存在: ${target.title}`);
  }
  return loot;
}

async function acceptanceReviewByTarget(target: ObjectiveTargetStateData) {
  const objective = await objectiveByTitle(target.title);
  if (!objective) return null;
  const [row] = await db
    .select({
      acceptedResult: objectiveAcceptanceReviews.acceptedResult,
      reason: objectiveAcceptanceReviews.reason,
      resultReviews: objectiveAcceptanceReviews.resultReviews,
      reviewerUserId: objectiveAcceptanceReviews.reviewerUserId,
    })
    .from(objectiveAcceptanceReviews)
    .where(eq(objectiveAcceptanceReviews.objectiveId, objective.id))
    .limit(1);
  return row ?? null;
}

function hasClaim(
  claims: LootResultClaim[],
  expected: {
    claim: string;
    evidenceText: string;
    resultId: string;
  },
) {
  return claims.some(
    (claim) =>
      claim.resultId === expected.resultId &&
      claim.claim === expected.claim &&
      claim.evidenceText === expected.evidenceText,
  );
}

export async function objectiveLootHasMetricClaim(input: {
  metric: MetricData;
  target: ObjectiveTargetStateData;
}) {
  const metric = await metricByTitle(input.metric.title);
  const loot = await objectiveLootByTarget(input.target);
  if (!metric || !loot) return false;
  return hasClaim(loot.resultClaims, {
    claim: input.metric.claim,
    evidenceText: input.metric.finalEvidence,
    resultId: metric.id,
  });
}

function addDaysIsoDate(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function addHoursIso(hours: number) {
  const date = new Date();
  date.setHours(date.getHours() + hours);
  return date.toISOString();
}

function today() {
  return new Date().toISOString();
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function numberEquals(actual: number | null | undefined, expected: number) {
  return typeof actual === "number" && Math.abs(actual - expected) < 0.0001;
}
