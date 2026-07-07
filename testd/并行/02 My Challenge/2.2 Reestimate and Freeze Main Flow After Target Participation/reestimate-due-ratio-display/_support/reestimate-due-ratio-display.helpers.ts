import { expect, type Locator, type Page, type Response } from "@playwright/test";
import { eq, ilike, or } from "drizzle-orm";
import { objectives } from "../../../../../../server/db/schema";
import {
  calculateObjectiveReestimateDueAt,
  REESTIMATE_WINDOW_HALF_DAY_MS,
} from "../../../../../../src/domain/orfReestimateWindow";
import type { ObjectiveFlowStatus, OrfStage } from "../../../../../../src/types/orf";
import {
  clearBrowserState,
  deleteTestObjective,
  readResponseBody,
  upsertTestObjective,
} from "../../../../../_operators/common.helpers";
import { db } from "../../../../../_operators/testd-db-client";
import type {
  MyChallengeApiObjective,
  MyChallengesApiData,
  ReestimateDueRatioObjectiveRecord,
  ReestimateDueRatioTargetData,
  TestUserAccountRecord,
} from "./reestimate-due-ratio-display.context";

const RESPONSE_TIMEOUT_MS = 5_000;

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

export async function prepareRecruitedObjective(input: {
  memberUser: TestUserAccountRecord;
  target: ReestimateDueRatioTargetData;
}) {
  const finalDueAt = addDaysIsoDate(input.target.finalDueOffsetDays);
  const objective = await upsertTestObjective({
    teamId: input.memberUser.teamId,
    title: input.target.title,
    stage: input.target.stage,
    flowStatus: input.target.flowStatus,
    status: "Draft",
    confidence: 70,
    progress: 0,
    finalDueAt,
    challengers: [],
    challengerUserIds: [],
    assignedChallengers: [input.memberUser.name],
    assignedChallengerUserIds: [input.memberUser.userId],
    objectiveBasePoints: 0,
    createdBy: input.memberUser.userId,
    updatedBy: input.memberUser.userId,
  });

  await db
    .update(objectives)
    .set({
      acceptedAt: null,
      confirmationDueAt: null,
      publishedAt: today(),
      updatedAt: today(),
    })
    .where(eq(objectives.id, objective.id));

  return requiredObjectiveByTitle(input.target.title);
}

export async function requiredObjectiveByTitle(title: string) {
  const objective = await objectiveByTitle(title);
  if (!objective) {
    throw new Error(`测试目标不存在: ${title}`);
  }
  return objective;
}

export async function objectiveByTitle(title: string): Promise<ReestimateDueRatioObjectiveRecord | null> {
  const [row] = await db
    .select({
      id: objectives.id,
      title: objectives.title,
      stage: objectives.stage,
      flowStatus: objectives.flowStatus,
      finalDueAt: objectives.finalDueAt,
      acceptedAt: objectives.acceptedAt,
      confirmationDueAt: objectives.confirmationDueAt,
      assignedChallengers: objectives.assignedChallengers,
      assignedChallengerUserIds: objectives.assignedChallengerUserIds,
      challengers: objectives.challengers,
      challengerUserIds: objectives.challengerUserIds,
    })
    .from(objectives)
    .where(eq(objectives.title, title))
    .limit(1);

  return row ?? null;
}

export async function objectiveHasStageAndFlowStatus(input: {
  title: string;
  stage: OrfStage;
  flowStatus: ObjectiveFlowStatus;
}) {
  const row = await objectiveByTitle(input.title);
  return row?.stage === input.stage && row.flowStatus === input.flowStatus;
}

export async function objectiveFinalDueOffsetMatches(input: {
  title: string;
  finalDueOffsetDays: number;
}) {
  const row = await objectiveByTitle(input.title);
  return row?.finalDueAt === addDaysIsoDate(input.finalDueOffsetDays);
}

export async function objectiveAssignedContains(input: {
  target: ReestimateDueRatioTargetData;
  memberUser: TestUserAccountRecord;
}) {
  const row = await objectiveByTitle(input.target.title);
  return Boolean(
    row &&
      row.assignedChallengerUserIds.includes(input.memberUser.userId) &&
      row.assignedChallengers.includes(input.memberUser.name),
  );
}

export async function objectiveChallengerContains(input: {
  target: ReestimateDueRatioTargetData;
  memberUser: TestUserAccountRecord;
}) {
  const row = await objectiveByTitle(input.target.title);
  return Boolean(
    row &&
      row.challengerUserIds.includes(input.memberUser.userId) &&
      row.challengers.includes(input.memberUser.name),
  );
}

export async function objectiveChallengerExcludes(input: {
  target: ReestimateDueRatioTargetData;
  memberUser: TestUserAccountRecord;
}) {
  const row = await objectiveByTitle(input.target.title);
  return Boolean(
    row &&
      !row.challengerUserIds.includes(input.memberUser.userId) &&
      !row.challengers.includes(input.memberUser.name),
  );
}

export async function objectiveAcceptedAtAbsent(target: ReestimateDueRatioTargetData) {
  const row = await objectiveByTitle(target.title);
  return row?.acceptedAt === null;
}

export async function objectiveAcceptedAtPresent(target: ReestimateDueRatioTargetData) {
  const row = await objectiveByTitle(target.title);
  return Boolean(row?.acceptedAt);
}

export async function objectiveReestimateDueAbsent(target: ReestimateDueRatioTargetData) {
  const row = await objectiveByTitle(target.title);
  return row?.confirmationDueAt === null;
}

export async function objectiveReestimateDueMatchesRule(target: ReestimateDueRatioTargetData) {
  const row = await objectiveByTitle(target.title);
  if (!row?.acceptedAt || !row.confirmationDueAt) return false;
  return sameInstant(row.confirmationDueAt, expectedReestimateDueAt(row));
}

export async function openBountyHallRelated(page: Page) {
  await page.goto("/bounties", { waitUntil: "domcontentloaded", timeout: 15_000 });
  const relatedTab = page.getByRole("tab", { name: /我的相关/ });
  await expect(page.getByRole("tablist", { name: "悬赏目标分组" })).toBeVisible();
  await relatedTab.click({ timeout: RESPONSE_TIMEOUT_MS });
  await expect(relatedTab).toHaveAttribute("aria-selected", "true");
}

export function bountyObjectiveRow(page: Page, objective: Pick<ReestimateDueRatioObjectiveRecord, "id" | "title">): Locator {
  return page
    .locator(`[data-bounty-objective-id="${cssAttributeValue(objective.id)}"]`)
    .or(page.locator(".bounty-list-row").filter({ hasText: objective.title }))
    .first();
}

export async function acceptBountyChallenge(page: Page, title: string) {
  const objective = await requiredObjectiveByTitle(title);
  const row = bountyObjectiveRow(page, objective);
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "接受挑战", exact: true }).click();

  const responsePromise = page
    .waitForResponse(
      (response) =>
        response.request().method().toUpperCase() === "PATCH" &&
        response.url().endsWith(`/api/objectives/${encodeURIComponent(objective.id)}/challenge`),
      { timeout: RESPONSE_TIMEOUT_MS },
    )
    .then(readObjectiveFromResponse);

  await acceptChallengeDialog(page).getByRole("button", { name: "接受挑战", exact: true }).click();
  return responsePromise;
}

export function acceptChallengeDialog(page: Page) {
  return page.getByRole("dialog", { name: "接受后会进入你的挑战页", exact: true });
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

export function objectiveTimeSummary(page: Page, title: string) {
  return objectivePanel(page, title).locator(".orf-objective-time-summary").first();
}

export async function myChallengesContainsObjective(page: Page, title: string) {
  return (await findMyChallengeObjective(page, title)) !== null;
}

export async function myChallengeObjectiveHasStageAndFlowStatus(input: {
  page: Page;
  title: string;
  stage: OrfStage;
  flowStatus: ObjectiveFlowStatus;
}) {
  const objective = await findMyChallengeObjective(input.page, input.title);
  return objective?.stage === input.stage && objective.flowStatus === input.flowStatus;
}

export async function myChallengeObjectiveReestimateDueMatchesRule(page: Page, title: string) {
  const objective = await findMyChallengeObjective(page, title);
  if (!objective?.acceptedAt || !objective.confirmationDueAt || !objective.finalDueAt) return false;
  return sameInstant(objective.confirmationDueAt, expectedReestimateDueAt(objective));
}

export async function findMyChallengeObjective(page: Page, title: string): Promise<MyChallengeApiObjective | null> {
  const data = await readMyChallenges(page);
  return data.objectives.find((objective) => objective.title === title) ?? null;
}

export async function readMyChallenges(page: Page): Promise<MyChallengesApiData> {
  return page.evaluate(async () => {
    const response = await fetch("/api/my-challenges?scope=mine", { credentials: "include" });
    if (!response.ok) {
      throw new Error(`读取我的挑战接口失败: ${response.status}`);
    }
    return (await response.json()) as MyChallengesApiData;
  });
}

export async function readObjectiveFromResponse(response: Response): Promise<ReestimateDueRatioObjectiveRecord> {
  if (!response.ok()) {
    throw new Error(`接受挑战接口请求失败: ${response.status()} ${response.url()}`);
  }
  const body = await readResponseBody(response);
  const value = (body as { objective?: unknown }).objective;
  if (typeof value !== "object" || value === null) {
    throw new Error("目标接口响应缺少 objective");
  }
  const objective = value as Partial<ReestimateDueRatioObjectiveRecord>;
  if (typeof objective.id !== "string" || typeof objective.title !== "string") {
    throw new Error("目标接口响应中的 objective 格式不完整");
  }
  return requiredObjectiveByTitle(objective.title);
}

export function expectedReestimateDueAt(
  objective: Pick<ReestimateDueRatioObjectiveRecord | MyChallengeApiObjective, "acceptedAt" | "finalDueAt">,
) {
  const value = calculateObjectiveReestimateDueAt(objective.finalDueAt, objective.acceptedAt);
  if (!value) {
    throw new Error("无法按重估窗口规则计算重估完成期限");
  }
  return value;
}

export function expectedReestimateDueAtMinuteLabel(objective: Pick<ReestimateDueRatioObjectiveRecord, "acceptedAt" | "finalDueAt">) {
  return formatDateTimeMinute(expectedReestimateDueAt(objective));
}

export async function expectedReestimateDueAtMinuteLabelByTitle(title: string) {
  const objective = await requiredObjectiveByTitle(title);
  return expectedReestimateDueAtMinuteLabel(objective);
}

export function reestimateRuleHalfDayMs() {
  return REESTIMATE_WINDOW_HALF_DAY_MS;
}

export async function clearCurrentBrowserState(page: Page) {
  await page.context().clearCookies();
  await clearBrowserState(page);
}

function formatDateTimeMinute(value: string | null | undefined) {
  if (!value) return "未设置";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

function addDaysIsoDate(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

function cssAttributeValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function sameInstant(left: string, right: string) {
  const leftTime = new Date(left).getTime();
  const rightTime = new Date(right).getTime();
  return Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime === rightTime;
}
