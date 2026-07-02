import { expect, type Page } from "@playwright/test";
import { and, eq, ilike, sql } from "drizzle-orm";
import { users, workLogEntries } from "../../../../../../server/db/schema";
import { localDateString } from "../../../../../../src/utils/date";
import { readResponseBody, readTestObjective } from "../../../../../_operators/common.helpers";
import { db } from "../../../../../_operators/testd-db-client";
import type {
  ObjectiveFixtureExpectation,
  WorkLogEntryFixture,
  WorkLogObjectiveOptionFixture,
} from "./member-search-non-participant-objective-submit-work-log.context";

const RESPONSE_TIMEOUT_MS = 5_000;
const submittedConfirmMessages = new WeakMap<Page, string>();

export function todayWorkDate() {
  return localDateString(new Date());
}

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

export async function openWorkLogTodayView(page: Page) {
  await page.goto("/work-logs?view=today");
  await expect(page).toHaveURL(/\/work-logs(?:\?[^#]*)?$/);
  await expect(workLogEditorPanel(page)).toBeVisible();
  await expect(workLogViewTab(page, "日志")).toHaveAttribute("aria-selected", "true");
}

export function workLogViewTab(page: Page, label: string) {
  return page.getByRole("tab", { name: label, exact: true });
}

export function workLogEditorPanel(page: Page) {
  return page.locator(".work-logs-editor-panel").filter({ hasText: "我的日志" }).first();
}

export function workLogClassificationControl(page: Page) {
  return page.getByRole("button", { name: "日志归类", exact: true });
}

export function submitWorkLogButton(page: Page) {
  return page.getByRole("button", { name: "提交日志", exact: true });
}

export async function openWorkLogDefaultObjectiveList(page: Page) {
  await workLogClassificationControl(page).click();
  await expect(workLogClassificationSearchInput(page)).toBeVisible();
}

export function workLogClassificationSearchInput(page: Page) {
  return page.getByLabel("搜索日志归类", { exact: true });
}

export function workLogClassificationOption(page: Page, title: string) {
  return page.locator(".orf-fantasy-select-option").filter({ hasText: title });
}

export async function fillWorkLogObjectiveSearch(page: Page, objectiveTitle: string) {
  await expect(workLogClassificationSearchInput(page)).toBeVisible();
  await workLogClassificationSearchInput(page).fill(objectiveTitle);
  await expect(workLogClassificationOption(page, objectiveTitle).first()).toBeVisible();
}

export async function selectWorkLogObjectiveSearchResult(page: Page, objectiveTitle: string) {
  await workLogClassificationOption(page, objectiveTitle).first().click();
  await expect(workLogClassificationControl(page)).toContainText(objectiveTitle);
}

export function workLogNonParticipantNotice(page: Page, notice: string) {
  return page.getByText(notice, { exact: true }).first();
}

export async function submitTodayWorkLogWithNonParticipantConfirm(page: Page, expectedMessage: string) {
  const responsePromise = page
    .waitForResponse(
      (response) =>
        response.request().method().toUpperCase() === "POST" &&
        /\/api\/work-logs\/my-day\/\d{4}-\d{2}-\d{2}$/.test(new URL(response.url()).pathname),
      { timeout: RESPONSE_TIMEOUT_MS },
    )
    .then(async (response) => {
      if (!response.ok()) {
        throw new Error(`提交工作日志接口失败: ${response.status()} ${JSON.stringify(await readResponseBody(response))}`);
      }
      return response;
    });

  const dialogPromise = new Promise<void>((resolve, reject) => {
    page.once("dialog", async (dialog) => {
      try {
        const message = dialog.message();
        expect(message).toContain(expectedMessage);
        submittedConfirmMessages.set(page, message);
        await dialog.accept();
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  });

  await submitWorkLogButton(page).click();
  await dialogPromise;
  await responsePromise;
}

export function submittedConfirmMessage(page: Page) {
  return submittedConfirmMessages.get(page) ?? "";
}

export function workLogHistory(page: Page) {
  return page.locator(".work-logs-history").filter({ hasText: "当天记录" }).first();
}

export function workLogHistoryEntry(page: Page, bodyMarker: string) {
  return workLogHistory(page).locator(".work-logs-history-entry").filter({ hasText: stableBodyMarker(bodyMarker) }).first();
}

export function workLogToast(page: Page, text: string) {
  return page.getByText(text, { exact: true }).first();
}

export async function readSessionUserName(page: Page) {
  return page.evaluate(async () => {
    const response = await fetch("/api/auth/session", { credentials: "include" });
    if (!response.ok) return null;
    const body = await response.json();
    return body?.authenticated === true && typeof body.user?.name === "string" ? body.user.name : null;
  });
}

export async function defaultWorkLogObjectiveOptions(page: Page): Promise<WorkLogObjectiveOptionFixture[]> {
  const response = await page.evaluate(async () => {
    const objectiveResponse = await fetch("/api/work-logs/objectives", { credentials: "include" });
    return {
      status: objectiveResponse.status,
      body: await objectiveResponse.json().catch(() => ({})),
    };
  });
  if (response.status !== 200) return [];
  const objectivesValue = (response.body as { objectives?: unknown }).objectives;
  return Array.isArray(objectivesValue) ? objectivesValue.filter(isWorkLogObjectiveOptionFixture) : [];
}

export async function defaultWorkLogObjectivesContain(page: Page, title: string) {
  return (await defaultWorkLogObjectiveOptions(page)).some((objective) => objective.title === title);
}

export async function apiMyDayEntries(page: Page) {
  const response = await page.evaluate(async (date) => {
    const dayResponse = await fetch(`/api/work-logs/my-day?date=${encodeURIComponent(date)}`, { credentials: "include" });
    return {
      status: dayResponse.status,
      body: await dayResponse.json().catch(() => ({})),
    };
  }, todayWorkDate());
  if (response.status !== 200) {
    return [];
  }
  const entries = (response.body as { entries?: unknown }).entries;
  return Array.isArray(entries) ? entries : [];
}

export async function apiMyDayContainsBodyMarker(page: Page, bodyMarker: string) {
  return (await apiMyDayEntries(page)).some((entry) => workLogEntryHasBodyMarker(entry, bodyMarker));
}

export async function apiMyDayEntryFieldEquals(
  page: Page,
  input: {
    bodyMarker: string;
    field: "objectiveTitleSnapshot" | "durationMinutes" | "remainingEstimatePercent";
    value: string | number;
  },
) {
  const entry = (await apiMyDayEntries(page)).find((item) => workLogEntryHasBodyMarker(item, input.bodyMarker));
  if (typeof entry !== "object" || entry === null) {
    return false;
  }
  return (entry as Record<string, unknown>)[input.field] === input.value;
}

export async function deleteWorkLogsByBodyMarker(bodyMarker: string) {
  await db.delete(workLogEntries).where(ilike(workLogEntries.bodyMarkdown, `%${escapeLike(stableBodyMarker(bodyMarker))}%`));
}

export async function dbWorkLogEntryByBodyMarker(bodyMarker: string): Promise<WorkLogEntryFixture | null> {
  const [row] = await db
    .select({
      id: workLogEntries.id,
      authorUserId: workLogEntries.authorUserId,
      workDate: workLogEntries.workDate,
      objectiveIdSnapshot: workLogEntries.objectiveIdSnapshot,
      objectiveTitleSnapshot: workLogEntries.objectiveTitleSnapshot,
      bodyMarkdown: workLogEntries.bodyMarkdown,
      durationMinutes: workLogEntries.durationMinutes,
      remainingEstimatePercent: workLogEntries.remainingEstimatePercent,
    })
    .from(workLogEntries)
    .where(ilike(workLogEntries.bodyMarkdown, `%${escapeLike(stableBodyMarker(bodyMarker))}%`))
    .limit(1);

  return row ?? null;
}

export async function dbWorkLogEntryForTodayByMemberAndMarker(input: {
  bodyMarker: string;
  memberEmail: string;
}): Promise<WorkLogEntryFixture | null> {
  const [row] = await db
    .select({
      id: workLogEntries.id,
      authorUserId: workLogEntries.authorUserId,
      workDate: workLogEntries.workDate,
      objectiveIdSnapshot: workLogEntries.objectiveIdSnapshot,
      objectiveTitleSnapshot: workLogEntries.objectiveTitleSnapshot,
      bodyMarkdown: workLogEntries.bodyMarkdown,
      durationMinutes: workLogEntries.durationMinutes,
      remainingEstimatePercent: workLogEntries.remainingEstimatePercent,
    })
    .from(workLogEntries)
    .innerJoin(users, eq(users.id, workLogEntries.authorUserId))
    .where(
      and(
        sql`lower(${users.email}) = ${input.memberEmail.toLowerCase()}`,
        eq(workLogEntries.workDate, todayWorkDate()),
        ilike(workLogEntries.bodyMarkdown, `%${escapeLike(stableBodyMarker(input.bodyMarker))}%`),
      ),
    )
    .limit(1);

  return row ?? null;
}

export async function objectiveFixtureMatches(input: ObjectiveFixtureExpectation) {
  const objective = await readTestObjective({ title: input.title });
  if (!objective) return false;
  if (input.teamId && objective.teamId !== input.teamId) return false;
  if (objective.flowStatus !== input.flowStatus) return false;
  if (input.challengerUserId && !objective.challengerUserIds.includes(input.challengerUserId)) return false;
  if (input.excludedChallengerUserId && objective.challengerUserIds.includes(input.excludedChallengerUserId)) return false;
  return true;
}

export async function userByNameAbsent(name: string) {
  const rows = await db.select({ id: users.id }).from(users).where(eq(users.name, name)).limit(1);
  return rows.length === 0;
}

export function requiredWorkLogEntry(value: unknown): WorkLogEntryFixture {
  if (
    typeof value === "object" &&
    value !== null &&
    typeof (value as WorkLogEntryFixture).id === "string" &&
    typeof (value as WorkLogEntryFixture).bodyMarkdown === "string"
  ) {
    return value as WorkLogEntryFixture;
  }
  throw new Error("参数必须是本用例工作日志");
}

function workLogEntryHasBodyMarker(value: unknown, bodyMarker: string) {
  return typeof value === "object" && value !== null && typeof (value as { bodyMarkdown?: unknown }).bodyMarkdown === "string"
    ? (value as { bodyMarkdown: string }).bodyMarkdown.includes(stableBodyMarker(bodyMarker))
    : false;
}

function escapeLike(value: string) {
  return value.replace(/[%_\\]/g, "\\$&");
}

function stableBodyMarker(value: string) {
  return value.replace(/\s+\[r[0-9a-f]+-c[0-9a-f]+-w\d+\]$/, "");
}

function isWorkLogObjectiveOptionFixture(value: unknown): value is WorkLogObjectiveOptionFixture {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as WorkLogObjectiveOptionFixture).id === "string" &&
    typeof (value as WorkLogObjectiveOptionFixture).title === "string" &&
    typeof (value as WorkLogObjectiveOptionFixture).flowStatus === "string" &&
    typeof (value as WorkLogObjectiveOptionFixture).isUserChallenger === "boolean"
  );
}
