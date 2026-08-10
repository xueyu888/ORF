import { expect, type Page } from "@playwright/test";
import { eq, sql } from "drizzle-orm";
import { objectives, users } from "../../../../../../server/db/schema";
import { readTestObjective } from "../../../../../_operators/common.helpers";
import { db } from "../../../../../_operators/testd-db-client";
import type { ObjectiveFixtureExpectation, WorkLogObjectiveOptionFixture } from "./member-default-objective-list-current-member-participated-incomplete.context";

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

export async function openWorkLogDefaultObjectiveList(page: Page) {
  await workLogClassificationControl(page).click();
  await expect(page.getByLabel("搜索日志归类", { exact: true })).toBeVisible();
}

export function workLogDefaultObjectiveOption(page: Page, title: string) {
  return page.locator(".orf-select-option").filter({ hasText: title });
}

export function workLogErrorMessage(page: Page) {
  return page.locator(".work-logs-error");
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

export async function defaultWorkLogObjectiveIsCurrentChallenger(page: Page, title: string) {
  return (await defaultWorkLogObjectiveOptions(page)).some((objective) => objective.title === title && objective.isUserChallenger);
}

export async function defaultWorkLogObjectiveFlowStatusEquals(page: Page, input: { title: string; flowStatus: string }) {
  return (await defaultWorkLogObjectiveOptions(page)).some(
    (objective) => objective.title === input.title && objective.flowStatus === input.flowStatus,
  );
}

export async function defaultWorkLogObjectivesContainOnlyTitleForPrefix(page: Page, input: { prefix: string; title: string }) {
  const prefix = withoutTestdScopeLabel(input.prefix);
  const matched = (await defaultWorkLogObjectiveOptions(page)).filter((objective) =>
    withoutTestdScopeLabel(objective.title).startsWith(prefix),
  );
  return matched.length === 1 && matched[0]?.title === input.title;
}

export async function deleteObjectivesByTitlePrefix(prefix: string) {
  await db.delete(objectives).where(sql`${objectives.title} LIKE ${`${withoutTestdScopeLabel(prefix)}%`}`);
}

export async function objectivesByTitlePrefixAbsent(prefix: string) {
  const rows = await db
    .select({ id: objectives.id })
    .from(objectives)
    .where(sql`${objectives.title} LIKE ${`${withoutTestdScopeLabel(prefix)}%`}`)
    .limit(1);
  return rows.length === 0;
}

export async function objectiveFixtureMatches(input: ObjectiveFixtureExpectation) {
  const objective = await readTestObjective({ title: input.title });
  if (!objective) return false;
  if (objective.flowStatus !== input.flowStatus) return false;
  if (input.challengerUserId && !objective.challengerUserIds.includes(input.challengerUserId)) return false;
  if (input.excludedChallengerUserId && objective.challengerUserIds.includes(input.excludedChallengerUserId)) return false;
  return true;
}

export async function userByNameAbsent(name: string) {
  const rows = await db.select({ id: users.id }).from(users).where(eq(users.name, name)).limit(1);
  return rows.length === 0;
}

function withoutTestdScopeLabel(value: string) {
  return value.replace(/\s+\[r[0-9a-f]+-c[0-9a-f]+-w\d+]$/i, "");
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
