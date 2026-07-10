import { expect, type Page } from "@playwright/test";
import { and, eq, ilike, inArray } from "drizzle-orm";
import { objectiveAlignmentRequests, objectiveLoot, objectives, results } from "../../../../../../server/db/schema";
import type {
  LootResultClaim,
  LootResultClaimStatus,
  ObjectiveAlignmentRequestKind,
  ObjectiveAlignmentRequestStatus,
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
  FinalLootData,
  MetricData,
  MyChallengesApiData,
  SubmittedObjectiveTargetData,
} from "./member-acceptance-alignment-request.context";

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
      acceptedAt: addHoursIso(-72),
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
  target: SubmittedObjectiveTargetData;
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
    detail: "TestD acceptance alignment request metric fixture",
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

export async function prepareFinalObjectiveLoot(input: {
  target: SubmittedObjectiveTargetData;
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

export async function deleteOpenAlignmentRequests(input: {
  target: SubmittedObjectiveTargetData;
  kind: ObjectiveAlignmentRequestKind;
}) {
  const objective = await objectiveByTitle(input.target.title);
  if (!objective) return;
  await db
    .delete(objectiveAlignmentRequests)
    .where(
      and(
        eq(objectiveAlignmentRequests.objectiveId, objective.id),
        eq(objectiveAlignmentRequests.kind, input.kind),
        inArray(objectiveAlignmentRequests.status, ["requested", "scheduled"]),
      ),
    );
}

export async function objectiveHasStageAndFlowStatus(target: SubmittedObjectiveTargetData) {
  const row = await objectiveByTitle(target.title);
  return row?.stage === target.stage && row.flowStatus === target.flowStatus;
}

export async function objectiveChallengerContains(input: {
  target: SubmittedObjectiveTargetData;
  memberUser: TestUserAccountRecord;
}) {
  const row = await objectiveByTitle(input.target.title);
  return Boolean(row?.challengerUserIds.includes(input.memberUser.userId));
}

export async function objectiveConfirmedAtExists(target: SubmittedObjectiveTargetData) {
  const row = await objectiveByTitle(target.title);
  return typeof row?.confirmedAt === "string" && row.confirmedAt.length > 0;
}

export async function objectiveLootSubmittedAtExists(target: SubmittedObjectiveTargetData) {
  const row = await objectiveByTitle(target.title);
  return typeof row?.lootSubmittedAt === "string" && row.lootSubmittedAt.length > 0;
}

export async function metricExistsWithScore(input: {
  target: SubmittedObjectiveTargetData;
  title: string;
  difficulty: UncertaintyLevel;
  score: number;
}) {
  const objective = await objectiveByTitle(input.target.title);
  if (!objective) return false;
  const row = await metricByTitle(input.title);
  return row?.objectiveId === objective.id && row.uncertaintyLevel === input.difficulty && row.uncertaintyScore === input.score;
}

export async function objectiveLootExists(input: {
  target: SubmittedObjectiveTargetData;
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
  target: SubmittedObjectiveTargetData;
  selfTestReportBody: string;
}) {
  const loot = await objectiveLootByTarget(input.target);
  return loot?.selfTestReportBody === input.selfTestReportBody;
}

export async function objectiveLootHasMetricClaim(input: {
  target: SubmittedObjectiveTargetData;
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

export async function openAlignmentRequestAbsent(input: {
  target: SubmittedObjectiveTargetData;
  kind: ObjectiveAlignmentRequestKind;
}) {
  return (await openAlignmentRequestCount(input)) === 0;
}

export async function openAlignmentRequestCount(input: {
  target: SubmittedObjectiveTargetData;
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
  target: SubmittedObjectiveTargetData;
  kind: ObjectiveAlignmentRequestKind;
  status: ObjectiveAlignmentRequestStatus;
  memberUser: TestUserAccountRecord;
}) {
  const request = await alignmentRequestByTarget(input);
  return Boolean(request);
}

export async function alignmentRequestProposedAtExists(input: {
  target: SubmittedObjectiveTargetData;
  kind: ObjectiveAlignmentRequestKind;
  status: ObjectiveAlignmentRequestStatus;
  memberUser: TestUserAccountRecord;
}) {
  const request = await alignmentRequestByTarget(input);
  return typeof request?.proposedAt === "string" && request.proposedAt.length > 0;
}

export async function requestAcceptanceAlignment(page: Page, targetTitle: string) {
  const panel = objectivePanel(page, targetTitle);
  await expect(panel).toBeVisible();
  await observeToastMessages(page);
  const responsePromise = page.waitForResponse(
    (response) => response.request().method() === "POST" && response.url().includes("/alignment-requests"),
  );
  const action = panel.getByRole("button", { name: "申请验收对齐", exact: true });
  await expect(action).toBeEnabled();
  await action.click();
  const response = await responsePromiseOrNull(responsePromise);
  if (response && !response.ok()) {
    throw new Error(`申请验收对齐接口失败: ${response.status()} ${response.url()}`);
  }
  await expect
    .poll(
      async () => {
        const input = { targetTitle, kind: "acceptance" as const };
        return (await myChallengesContainsOpenAlignmentRequest(page, input)) || (await alignmentRequestStatusExistsByTitle({ ...input, status: "requested" }));
      },
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

export async function myChallengesObjectiveHasStageAndFlowStatus(page: Page, target: SubmittedObjectiveTargetData) {
  const data = await readMyChallenges(page);
  const objective = data.objectives.find((item) => item.title === target.title);
  return objective?.stage === target.stage && objective.flowStatus === target.flowStatus;
}

export async function myChallengesContainsObjectiveLoot(page: Page, input: {
  targetTitle: string;
  finalLoot: FinalLootData;
  memberUser: TestUserAccountRecord;
}) {
  const data = await readMyChallenges(page);
  const objective = data.objectives.find((item) => item.title === input.targetTitle);
  if (!objective) return false;
  return data.objectiveLoot.some(
    (loot) =>
      loot.objectiveId === objective.id &&
      loot.submittedByUserId === input.memberUser.userId &&
      loot.body === input.finalLoot.body,
  );
}

export async function myChallengesContainsAlignmentRequest(page: Page, input: {
  targetTitle: string;
  kind: ObjectiveAlignmentRequestKind;
  status: ObjectiveAlignmentRequestStatus;
  memberUser: TestUserAccountRecord;
}) {
  const request = await myChallengesAlignmentRequest(page, input);
  return Boolean(request);
}

export async function myChallengesAlignmentRequestProposedAtExists(page: Page, input: {
  targetTitle: string;
  kind: ObjectiveAlignmentRequestKind;
  status: ObjectiveAlignmentRequestStatus;
  memberUser: TestUserAccountRecord;
}) {
  const request = await myChallengesAlignmentRequest(page, input);
  return typeof request?.proposedAt === "string" && request.proposedAt.length > 0;
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

export async function alignmentRequestStatusExistsByTitle(input: {
  targetTitle: string;
  kind: ObjectiveAlignmentRequestKind;
  status: ObjectiveAlignmentRequestStatus;
}) {
  const objective = await objectiveByTitle(input.targetTitle);
  if (!objective) return false;
  const rows = await db
    .select({ id: objectiveAlignmentRequests.id })
    .from(objectiveAlignmentRequests)
    .where(
      and(
        eq(objectiveAlignmentRequests.objectiveId, objective.id),
        eq(objectiveAlignmentRequests.kind, input.kind),
        eq(objectiveAlignmentRequests.status, input.status),
      ),
    )
    .limit(1);
  return rows.length === 1;
}

async function myChallengesAlignmentRequest(page: Page, input: {
  targetTitle: string;
  kind: ObjectiveAlignmentRequestKind;
  status: ObjectiveAlignmentRequestStatus;
  memberUser: TestUserAccountRecord;
}) {
  const data = await readMyChallenges(page);
  const objective = data.objectives.find((item) => item.title === input.targetTitle);
  if (!objective) return null;
  return (
    data.objectiveAlignmentRequests.find(
      (request) =>
        request.objectiveId === objective.id &&
        request.kind === input.kind &&
        request.status === input.status &&
        request.requestedByUserId === input.memberUser.userId,
    ) ?? null
  );
}

async function alignmentRequestByTarget(input: {
  target: SubmittedObjectiveTargetData;
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

async function objectiveLootByTarget(target: SubmittedObjectiveTargetData) {
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
