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
import type { FrozenObjectiveTargetData, MetricData, MyChallengesApiData } from "./member-frozen-reestimate-request.context";

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
  if (visibleCount > 0) {
    return true;
  }

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

export async function prepareFrozenObjective(input: {
  memberUser: TestUserAccountRecord;
  target: FrozenObjectiveTargetData;
}): Promise<TestObjectiveFixtureRecord> {
  const finalDueAt = addDaysIsoDate(input.target.finalDueOffsetDays);
  const record = await upsertTestObjective({
    teamId: input.memberUser.teamId,
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
    createdBy: input.memberUser.userId,
    updatedBy: input.memberUser.userId,
  });

  await db
    .update(objectives)
    .set({
      acceptedAt: addHoursIso(-48),
      confirmationDueAt: null,
      confirmedAt: addHoursIso(-1),
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
    detail: "TestD frozen reestimate metric fixture",
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

export async function deleteOpenAlignmentRequests(input: {
  target: FrozenObjectiveTargetData;
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

export async function openAlignmentRequestCount(input: {
  target: FrozenObjectiveTargetData;
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

export async function alignmentRequestExistsWithNote(input: {
  target: FrozenObjectiveTargetData;
  kind: ObjectiveAlignmentRequestKind;
  status: ObjectiveAlignmentRequestStatus;
  memberUser: TestUserAccountRecord;
  note: string;
}) {
  const objective = await objectiveByTitle(input.target.title);
  if (!objective) return false;
  const rows = await db
    .select({
      id: objectiveAlignmentRequests.id,
      note: objectiveAlignmentRequests.note,
    })
    .from(objectiveAlignmentRequests)
    .where(
      and(
        eq(objectiveAlignmentRequests.objectiveId, objective.id),
        eq(objectiveAlignmentRequests.kind, input.kind),
        eq(objectiveAlignmentRequests.status, input.status),
        eq(objectiveAlignmentRequests.requestedByUserId, input.memberUser.userId),
        eq(objectiveAlignmentRequests.note, input.note),
      ),
    )
    .limit(1);
  return rows.length === 1;
}

export async function fillFrozenReestimateReason(page: Page, input: { targetTitle: string; reason: string }) {
  const panel = objectivePanel(page, input.targetTitle);
  await expect(panel).toBeVisible();
  const reasonInput = panel.getByLabel("重新重估理由", { exact: true });
  await expect(reasonInput).toBeVisible();
  await reasonInput.fill(input.reason);
  await expect(reasonInput).toHaveValue(input.reason);
}

export async function requestFrozenReestimate(page: Page, input: { targetTitle: string; reason: string }) {
  const panel = objectivePanel(page, input.targetTitle);
  await expect(panel).toBeVisible();
  await observeToastMessages(page);
  const responsePromise = page.waitForResponse(
    (response) => response.request().method() === "POST" && response.url().includes("/alignment-requests"),
  );
  const button = panel.getByRole("button", { name: "申请重新重估", exact: true });
  await expect(button).toBeEnabled();
  await button.click();
  const response = await responsePromiseOrNull(responsePromise);
  if (response && !response.ok()) {
    throw new Error(`申请重新重估接口失败: ${response.status()} ${response.url()}`);
  }
  await expect
    .poll(() =>
      myChallengesContainsAlignmentRequestWithNote(page, {
        targetTitle: input.targetTitle,
        kind: "frozenReestimate",
        status: "requested",
        note: input.reason,
      }),
    )
    .toBe(true);
}

export async function frozenReestimateActionHidden(page: Page, targetTitle: string) {
  await expect(objectivePanel(page, targetTitle).getByRole("button", { name: "申请重新重估", exact: true })).toHaveCount(0);
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

export async function myChallengesContainsAlignmentRequestWithNote(page: Page, input: {
  targetTitle: string;
  kind: ObjectiveAlignmentRequestKind;
  status: ObjectiveAlignmentRequestStatus;
  note: string;
}) {
  const data = await readMyChallenges(page);
  const objective = data.objectives.find((item) => item.title === input.targetTitle);
  if (!objective) return false;
  return data.objectiveAlignmentRequests.some(
    (request) =>
      request.objectiveId === objective.id &&
      request.kind === input.kind &&
      request.status === input.status &&
      request.note === input.note,
  );
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
