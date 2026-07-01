import { expect, type Page } from "@playwright/test";
import { and, eq, ilike, sql } from "drizzle-orm";
import { users, workLogEntries } from "../../../../../../server/db/schema";
import { localDateString } from "../../../../../../src/utils/date";
import { readResponseBody } from "../../../../../_operators/common.helpers";
import { db } from "../../../../../_operators/testd-db-client";
import { createStableUuid } from "../../../../../_shared/ids";
import type {
  TestUserAccountFixture,
  WorkLogEntryFixture,
  WorkLogObjectiveFixture,
} from "./member-edit-today-work-log.context";

const RESPONSE_TIMEOUT_MS = 5_000;

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

export function workLogDateControl(page: Page) {
  return page.getByRole("button", { name: "选择日志日期", exact: true });
}

export function workLogEditorPanel(page: Page) {
  return page.locator(".work-logs-editor-panel").filter({ hasText: "我的日志" }).first();
}

export function updateWorkLogButton(page: Page) {
  return page.getByRole("button", { name: "更新日志", exact: true });
}

export async function updateWorkLog(page: Page) {
  const responsePromise = page
    .waitForResponse(
      (response) =>
        response.request().method().toUpperCase() === "PATCH" &&
        /\/api\/work-logs\/entries\/[^/]+$/.test(new URL(response.url()).pathname),
      { timeout: RESPONSE_TIMEOUT_MS },
    )
    .then(async (response) => {
      if (!response.ok()) {
        throw new Error(`更新工作日志接口失败: ${response.status()} ${JSON.stringify(await readResponseBody(response))}`);
      }
      return response;
    });

  await updateWorkLogButton(page).click();
  await responsePromise;
}

export function workLogHistory(page: Page) {
  return page.locator(".work-logs-history").filter({ hasText: "当天记录" }).first();
}

export function workLogHistoryEntry(page: Page, bodyMarker: string) {
  return workLogHistory(page).locator(".work-logs-history-entry").filter({ hasText: stableBodyMarker(bodyMarker) }).first();
}

export function workLogEditButton(page: Page, bodyMarker: string) {
  return workLogHistoryEntry(page, bodyMarker).getByRole("button", { name: /^编辑日志：/ });
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

export async function prepareTodayWorkLogEntry(input: {
  memberUser: TestUserAccountFixture;
  objective: WorkLogObjectiveFixture;
  bodyMarker: string;
  body: string;
  durationMinutes: number;
  remainingEstimatePercent: number;
}) {
  const now = new Date().toISOString();
  const id = createStableUuid("testd-work-log-entry", `${input.memberUser.email}:${todayWorkDate()}:${stableBodyMarker(input.bodyMarker)}`);
  const values = {
    id,
    teamId: input.memberUser.teamId,
    authorUserId: input.memberUser.userId,
    authorNameSnapshot: input.memberUser.name,
    workDate: todayWorkDate(),
    objectiveId: input.objective.id,
    objectiveIdSnapshot: input.objective.id,
    objectiveTitleSnapshot: input.objective.title,
    categoryId: null,
    categoryIdSnapshot: null,
    categoryNameSnapshot: null,
    bodyMarkdown: input.body,
    durationMinutes: input.durationMinutes,
    remainingEstimatePercent: input.remainingEstimatePercent,
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
  };

  await db
    .insert(workLogEntries)
    .values(values)
    .onConflictDoUpdate({
      target: workLogEntries.id,
      set: {
        teamId: values.teamId,
        authorUserId: values.authorUserId,
        authorNameSnapshot: values.authorNameSnapshot,
        workDate: values.workDate,
        objectiveId: values.objectiveId,
        objectiveIdSnapshot: values.objectiveIdSnapshot,
        objectiveTitleSnapshot: values.objectiveTitleSnapshot,
        categoryId: values.categoryId,
        categoryIdSnapshot: values.categoryIdSnapshot,
        categoryNameSnapshot: values.categoryNameSnapshot,
        bodyMarkdown: values.bodyMarkdown,
        durationMinutes: values.durationMinutes,
        remainingEstimatePercent: values.remainingEstimatePercent,
        sortOrder: values.sortOrder,
        updatedAt: values.updatedAt,
      },
    });

  const entry = await dbWorkLogEntryForTodayByMemberAndMarker({
    bodyMarker: input.bodyMarker,
    memberEmail: input.memberUser.email,
  });
  if (!entry) {
    throw new Error("预置当天工作日志后无法读取记录");
  }
  return entry;
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

export async function countTodayWorkLogEntriesByMemberAndObjective(input: {
  memberEmail: string;
  objectiveTitle: string;
}) {
  const rows = await db
    .select({ id: workLogEntries.id })
    .from(workLogEntries)
    .innerJoin(users, eq(users.id, workLogEntries.authorUserId))
    .where(
      and(
        sql`lower(${users.email}) = ${input.memberEmail.toLowerCase()}`,
        eq(workLogEntries.workDate, todayWorkDate()),
        eq(workLogEntries.objectiveTitleSnapshot, input.objectiveTitle),
      ),
    );
  return rows.length;
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

export function requiredTestUserAccount(value: unknown): TestUserAccountFixture {
  if (
    typeof value === "object" &&
    value !== null &&
    typeof (value as TestUserAccountFixture).userId === "string" &&
    typeof (value as TestUserAccountFixture).teamId === "string" &&
    typeof (value as TestUserAccountFixture).name === "string" &&
    typeof (value as TestUserAccountFixture).email === "string"
  ) {
    return value as TestUserAccountFixture;
  }
  throw new Error("参数必须是本用例成员用户");
}

export function requiredWorkLogObjective(value: unknown): WorkLogObjectiveFixture {
  if (
    typeof value === "object" &&
    value !== null &&
    typeof (value as WorkLogObjectiveFixture).id === "string" &&
    typeof (value as WorkLogObjectiveFixture).teamId === "string" &&
    typeof (value as WorkLogObjectiveFixture).title === "string"
  ) {
    return value as WorkLogObjectiveFixture;
  }
  throw new Error("参数必须是本用例工作日志目标");
}

function objectiveOptionHasTitle(value: unknown, title: string) {
  return typeof value === "object" && value !== null && (value as { title?: unknown }).title === title;
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
