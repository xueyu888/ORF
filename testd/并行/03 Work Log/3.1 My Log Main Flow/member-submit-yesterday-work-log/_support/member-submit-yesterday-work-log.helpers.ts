import { expect, type Page } from "@playwright/test";
import { and, eq, ilike, sql } from "drizzle-orm";
import { users, workLogEntries } from "../../../../../../server/db/schema";
import { localDateString } from "../../../../../../src/utils/date";
import { readResponseBody } from "../../../../../_operators/common.helpers";
import { db } from "../../../../../_operators/testd-db-client";
import type { WorkLogDateScope, WorkLogEntryFixture } from "./member-submit-yesterday-work-log.context";

const RESPONSE_TIMEOUT_MS = 5_000;

export function todayWorkDate() {
  return localDateString(new Date());
}

export function yesterdayWorkDate() {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return localDateString(date);
}

export function workDateForScope(scope: WorkLogDateScope) {
  return scope === "yesterday" ? yesterdayWorkDate() : todayWorkDate();
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

export async function selectPreviousWorkLogDate(page: Page) {
  await page.getByRole("button", { name: "前一天", exact: true }).click();
  await expect(workLogDateControl(page)).toContainText(yesterdayWorkDate());
}

export function workLogViewTab(page: Page, label: string) {
  return page.getByRole("tab", { name: label, exact: true });
}

export function workLogDateControl(page: Page) {
  return page.getByRole("button", { name: "选择日志日期", exact: true });
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

export async function selectWorkLogObjective(page: Page, objectiveTitle: string) {
  await workLogClassificationControl(page).click();
  await page.getByLabel("搜索日志归类", { exact: true }).fill(objectiveTitle);
  await page
    .locator(".orf-select-option")
    .filter({ hasText: objectiveTitle })
    .first()
    .click();
  await expect(workLogClassificationControl(page)).toContainText(objectiveTitle);
}

export async function submitWorkLog(page: Page) {
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

  await submitWorkLogButton(page).click();
  await responsePromise;
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

export async function workLogObjectivesContain(page: Page, objectiveTitle: string) {
  const response = await page.evaluate(async () => {
    const objectiveResponse = await fetch("/api/work-logs/objectives", { credentials: "include" });
    return {
      status: objectiveResponse.status,
      body: await objectiveResponse.json().catch(() => ({})),
    };
  });
  if (response.status !== 200) return false;
  const objectives = (response.body as { objectives?: unknown }).objectives;
  return Array.isArray(objectives) && objectives.some((item) => objectiveOptionHasTitle(item, objectiveTitle));
}

export async function workLogObjectiveIsCurrentChallenger(page: Page, objectiveTitle: string) {
  const response = await page.evaluate(async () => {
    const objectiveResponse = await fetch("/api/work-logs/objectives", { credentials: "include" });
    return {
      status: objectiveResponse.status,
      body: await objectiveResponse.json().catch(() => ({})),
    };
  });
  if (response.status !== 200) return false;
  const objectives = (response.body as { objectives?: unknown }).objectives;
  return Array.isArray(objectives) && objectives.some((item) => objectiveOptionHasTitle(item, objectiveTitle) && objectiveOptionIsUserChallenger(item));
}

export async function apiMyDayEntries(page: Page, scope: WorkLogDateScope) {
  const response = await page.evaluate(async (date) => {
    const dayResponse = await fetch(`/api/work-logs/my-day?date=${encodeURIComponent(date)}`, { credentials: "include" });
    return {
      status: dayResponse.status,
      body: await dayResponse.json().catch(() => ({})),
    };
  }, workDateForScope(scope));
  if (response.status !== 200) {
    return [];
  }
  const entries = (response.body as { entries?: unknown }).entries;
  return Array.isArray(entries) ? entries : [];
}

export async function apiMyDayContainsBodyMarker(page: Page, input: { bodyMarker: string; scope: WorkLogDateScope }) {
  return (await apiMyDayEntries(page, input.scope)).some((entry) => workLogEntryHasBodyMarker(entry, input.bodyMarker));
}

export async function apiMyDayEntryFieldEquals(
  page: Page,
  input: {
    bodyMarker: string;
    field: "objectiveTitleSnapshot" | "durationMinutes" | "remainingEstimatePercent";
    scope: WorkLogDateScope;
    value: string | number;
  },
) {
  const entry = (await apiMyDayEntries(page, input.scope)).find((item) => workLogEntryHasBodyMarker(item, input.bodyMarker));
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

export async function dbWorkLogEntryForDateByMemberAndMarker(input: {
  bodyMarker: string;
  memberEmail: string;
  scope: WorkLogDateScope;
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
        eq(workLogEntries.workDate, workDateForScope(input.scope)),
        ilike(workLogEntries.bodyMarkdown, `%${escapeLike(stableBodyMarker(input.bodyMarker))}%`),
      ),
    )
    .limit(1);

  return row ?? null;
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

function objectiveOptionHasTitle(value: unknown, title: string) {
  return typeof value === "object" && value !== null && (value as { title?: unknown }).title === title;
}

function objectiveOptionIsUserChallenger(value: unknown) {
  return typeof value === "object" && value !== null && (value as { isUserChallenger?: unknown }).isUserChallenger === true;
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
