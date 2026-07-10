import { expect, type Page } from "@playwright/test";
import { and, eq, ilike, inArray, sql } from "drizzle-orm";
import { teamMembers, teams, users, workLogCategories, workLogEntries } from "../../../../../../server/db/schema";
import { localDateString } from "../../../../../../src/utils/date";
import { createStableUuid } from "../../../../../_shared/ids";
import { db } from "../../../../../_operators/testd-db-client";
import type {
  WorkLogCategoryFixture,
  WorkLogCategoryOptionFixture,
  WorkLogEntryFixture,
  WorkLogSaveResultFixture,
} from "./member-management-category-forbidden.context";

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

export function workLogClassificationSearchInput(page: Page) {
  return page.getByLabel("搜索日志归类", { exact: true });
}

export function workLogClassificationOption(page: Page, title: string) {
  return page.locator(".orf-fantasy-select-option").filter({ hasText: title });
}

export async function openWorkLogClassification(page: Page) {
  await workLogClassificationControl(page).click();
  await expect(workLogClassificationSearchInput(page)).toBeVisible();
}

export async function searchWorkLogClassification(page: Page, query: string) {
  await expect(workLogClassificationSearchInput(page)).toBeVisible();
  await workLogClassificationSearchInput(page).fill(query);
}

export async function readSessionUserName(page: Page) {
  return page.evaluate(async () => {
    const response = await fetch("/api/auth/session", { credentials: "include" });
    if (!response.ok) return null;
    const body = await response.json();
    return body?.authenticated === true && typeof body.user?.name === "string" ? body.user.name : null;
  });
}

export async function workLogCategoryOptions(page: Page): Promise<WorkLogCategoryOptionFixture[]> {
  const response = await page.evaluate(async () => {
    const categoryResponse = await fetch("/api/work-logs/objectives", { credentials: "include" });
    return {
      status: categoryResponse.status,
      body: await categoryResponse.json().catch(() => ({})),
    };
  });
  if (response.status !== 200) return [];
  const categoriesValue = (response.body as { categories?: unknown }).categories;
  return Array.isArray(categoriesValue) ? categoriesValue.filter(isWorkLogCategoryOptionFixture) : [];
}

export async function workLogCategoriesContain(page: Page, name: string) {
  return (await workLogCategoryOptions(page)).some((category) => category.name === name);
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

export async function submitManagementCategoryWorkLogByApi(
  page: Page,
  input: { categoryName: string; bodyMarkdown: string },
): Promise<WorkLogSaveResultFixture> {
  return page.evaluate(
    async ({ categoryName, bodyMarkdown, workDate }) => {
      const response = await fetch(`/api/work-logs/my-day/${encodeURIComponent(workDate)}`, {
        body: JSON.stringify({
          bodyMarkdown,
          categoryName,
          durationMinutes: null,
          objectiveId: null,
          remainingEstimatePercent: null,
        }),
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      return {
        status: response.status,
        body: await response.json().catch(() => null),
      };
    },
    { ...input, workDate: todayWorkDate() },
  );
}

export function requiredWorkLogSaveResult(value: unknown): WorkLogSaveResultFixture {
  if (typeof value === "object" && value !== null && typeof (value as WorkLogSaveResultFixture).status === "number") {
    return value as WorkLogSaveResultFixture;
  }
  throw new Error("参数必须是本用例工作日志保存结果");
}

export async function prepareManagementWorkLogCategory(input: {
  categoryName: string;
  createdByUserId: string;
  memberUserId: string;
  teamId: string;
  teamName: string;
}): Promise<WorkLogCategoryFixture> {
  const now = new Date().toISOString();
  await ensureIsolatedTeam({
    adminUserId: input.createdByUserId,
    memberUserId: input.memberUserId,
    teamId: input.teamId,
    teamName: input.teamName,
  });
  const id = createStableUuid(
    "testd-work-log-management-category",
    `${input.teamId}:${input.createdByUserId}:${input.categoryName}`,
  );
  const [row] = await db
    .insert(workLogCategories)
    .values({
      id,
      teamId: input.teamId,
      name: input.categoryName,
      normalizedName: normalizeWorkLogCategoryNameKey(input.categoryName),
      createdByUserId: input.createdByUserId,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [workLogCategories.teamId, workLogCategories.normalizedName],
      set: {
        createdByUserId: input.createdByUserId,
        name: input.categoryName,
        updatedAt: now,
      },
    })
    .returning({
      id: workLogCategories.id,
      teamId: workLogCategories.teamId,
      name: workLogCategories.name,
      createdByUserId: workLogCategories.createdByUserId,
    });

  if (!row) {
    throw new Error("工作日志管理分类准备后无法读取");
  }
  return row;
}

async function ensureIsolatedTeam(input: { adminUserId: string; memberUserId: string; teamId: string; teamName: string }) {
  await db
    .insert(teams)
    .values({
      id: input.teamId,
      name: input.teamName,
      createdAt: todayWorkDate(),
    })
    .onConflictDoUpdate({
      target: teams.id,
      set: { name: input.teamName },
    });

  await db.delete(teamMembers).where(inArray(teamMembers.userId, [input.adminUserId, input.memberUserId]));
  await db.insert(teamMembers).values([
    {
      teamId: input.teamId,
      userId: input.adminUserId,
      role: "admin",
    },
    {
      teamId: input.teamId,
      userId: input.memberUserId,
      role: "member",
    },
  ]);
}

export async function deleteWorkLogCategoryByFixture(value: unknown) {
  const category = requiredWorkLogCategory(value);
  await db.delete(workLogCategories).where(eq(workLogCategories.id, category.id));
}

export async function dbWorkLogCategoryByNameAndTeam(input: {
  categoryName: string;
  teamId: string;
}): Promise<WorkLogCategoryFixture | null> {
  const [row] = await db
    .select({
      id: workLogCategories.id,
      teamId: workLogCategories.teamId,
      name: workLogCategories.name,
      createdByUserId: workLogCategories.createdByUserId,
    })
    .from(workLogCategories)
    .where(
      and(
        eq(workLogCategories.teamId, input.teamId),
        eq(workLogCategories.normalizedName, normalizeWorkLogCategoryNameKey(input.categoryName)),
      ),
    )
    .limit(1);

  return row ?? null;
}

export async function dbWorkLogCategoryById(value: unknown): Promise<WorkLogCategoryFixture | null> {
  const category = requiredWorkLogCategory(value);
  const [row] = await db
    .select({
      id: workLogCategories.id,
      teamId: workLogCategories.teamId,
      name: workLogCategories.name,
      createdByUserId: workLogCategories.createdByUserId,
    })
    .from(workLogCategories)
    .where(eq(workLogCategories.id, category.id))
    .limit(1);

  return row ?? null;
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
      categoryNameSnapshot: workLogEntries.categoryNameSnapshot,
      bodyMarkdown: workLogEntries.bodyMarkdown,
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
      categoryNameSnapshot: workLogEntries.categoryNameSnapshot,
      bodyMarkdown: workLogEntries.bodyMarkdown,
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

export async function dbWorkLogEntryForTodayByMemberAndCategory(input: {
  categoryName: string;
  memberEmail: string;
}): Promise<WorkLogEntryFixture | null> {
  const [row] = await db
    .select({
      id: workLogEntries.id,
      authorUserId: workLogEntries.authorUserId,
      workDate: workLogEntries.workDate,
      categoryNameSnapshot: workLogEntries.categoryNameSnapshot,
      bodyMarkdown: workLogEntries.bodyMarkdown,
    })
    .from(workLogEntries)
    .innerJoin(users, eq(users.id, workLogEntries.authorUserId))
    .where(
      and(
        sql`lower(${users.email}) = ${input.memberEmail.toLowerCase()}`,
        eq(workLogEntries.workDate, todayWorkDate()),
        eq(workLogEntries.categoryNameSnapshot, input.categoryName),
      ),
    )
    .limit(1);

  return row ?? null;
}

function requiredWorkLogCategory(value: unknown): WorkLogCategoryFixture {
  if (
    typeof value === "object" &&
    value !== null &&
    typeof (value as WorkLogCategoryFixture).id === "string" &&
    typeof (value as WorkLogCategoryFixture).teamId === "string"
  ) {
    return value as WorkLogCategoryFixture;
  }
  throw new Error("参数必须是本用例工作日志管理分类");
}

function isWorkLogCategoryOptionFixture(value: unknown): value is WorkLogCategoryOptionFixture {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as WorkLogCategoryOptionFixture).id === "string" &&
    typeof (value as WorkLogCategoryOptionFixture).name === "string" &&
    typeof (value as WorkLogCategoryOptionFixture).source === "string"
  );
}

function workLogEntryHasBodyMarker(value: unknown, bodyMarker: string) {
  return typeof value === "object" && value !== null && typeof (value as { bodyMarkdown?: unknown }).bodyMarkdown === "string"
    ? (value as { bodyMarkdown: string }).bodyMarkdown.includes(stableBodyMarker(bodyMarker))
    : false;
}

function normalizeWorkLogCategoryNameKey(value: string) {
  return value.replace(/\s+/g, " ").trim().toLocaleLowerCase();
}

function escapeLike(value: string) {
  return value.replace(/[%_\\]/g, "\\$&");
}

function stableBodyMarker(value: string) {
  return value.replace(/\s+\[r[0-9a-f]+-c[0-9a-f]+-w\d+\]$/, "");
}
