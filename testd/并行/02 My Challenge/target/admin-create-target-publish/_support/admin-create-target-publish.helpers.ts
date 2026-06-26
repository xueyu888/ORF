import { expect, type Locator, type Page, type Response } from "@playwright/test";
import { eq, or } from "drizzle-orm";
import { objectives } from "../../../../../../server/db/schema";
import { db } from "../../../../../_operators/testd-db-client";
import { readResponseBody } from "../../../../../_operators/common.helpers";
import type { AdminCreateTargetPublishObjective } from "./admin-create-target-publish.context";

const RESPONSE_TIMEOUT_MS = 5_000;

export function createObjectiveButton(page: Page) {
  return page.getByRole("button", { name: "新建目标", exact: true }).first();
}

export async function clickCreateObjective(page: Page) {
  await createObjectiveButton(page).click();
  await expect(page).toHaveURL(/\/tasks(?:\?.*)?$/);
  await expect(draftTitleInput(page)).toBeVisible();
}

export async function loginAsAdmin(page: Page, input: { email: string; password: string }) {
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

export function challengeScopeTab(page: Page, label: string) {
  return page.getByRole("button", { name: label, exact: true });
}

export function challengeProjectTrigger(page: Page) {
  return page.getByRole("button", { name: "挑战项目" });
}

export function draftTitleInput(page: Page) {
  return page.getByLabel("编辑目标标题", { exact: true });
}

export async function submitDraftTitle(page: Page, title: string): Promise<AdminCreateTargetPublishObjective> {
  const responsePromise = page
    .waitForResponse(
      (response) =>
        response.request().method().toUpperCase() === "POST" &&
        response.url().endsWith("/api/objectives"),
      { timeout: RESPONSE_TIMEOUT_MS },
    )
    .then(readObjectiveFromResponse);

  await draftTitleInput(page).press("Enter");
  const objective = await responsePromise;
  if (objective.title !== title) {
    throw new Error(`新建目标标题不匹配: expected=${title}, actual=${objective.title}`);
  }
  await expect(objectivePanel(page, objective)).toBeVisible();
  return objective;
}

export function objectivePanel(page: Page, objective: Pick<AdminCreateTargetPublishObjective, "id" | "title">): Locator {
  const byId = page.locator(`[data-objective-panel-id="${cssAttributeValue(objective.id)}"]`);
  return byId.or(page.locator(".orf-objective-panel").filter({ hasText: objective.title })).first();
}

export async function publishObjectiveFromPanel(page: Page, objective: AdminCreateTargetPublishObjective): Promise<AdminCreateTargetPublishObjective> {
  const panel = objectivePanel(page, objective);
  await expect(panel).toBeVisible();

  const responsePromise = page
    .waitForResponse(
      (response) =>
        response.request().method().toUpperCase() === "PATCH" &&
        response.url().endsWith(`/api/objectives/${encodeURIComponent(objective.id)}/publish`),
      { timeout: RESPONSE_TIMEOUT_MS },
    )
    .then(readObjectiveFromResponse);

  await panel.getByRole("button", { name: "发布", exact: true }).click();
  const published = await responsePromise;
  await expect(panel.getByRole("button", { name: "征召", exact: true })).toBeVisible();
  return published;
}

export function recruitButton(page: Page, objective: Pick<AdminCreateTargetPublishObjective, "id" | "title">) {
  return objectivePanel(page, objective).getByRole("button", { name: "征召", exact: true });
}

export async function bountyHallContainsObjective(page: Page, objective: Pick<AdminCreateTargetPublishObjective, "id" | "title">) {
  const response = await page.evaluate(async () => {
    const bountyResponse = await fetch("/api/bounties", { credentials: "include" });
    return {
      status: bountyResponse.status,
      body: await bountyResponse.json().catch(() => ({})),
    };
  });
  if (response.status !== 200) return false;
  return bountyHallBodyContainsObjective(response.body, objective);
}

export function bountyObjectiveRow(page: Page, objective: Pick<AdminCreateTargetPublishObjective, "id" | "title">) {
  return page
    .locator(`[data-bounty-objective-id="${cssAttributeValue(objective.id)}"]`)
    .or(page.locator(".bounty-list-row").filter({ hasText: objective.title }))
    .first();
}

export async function dbObjectivePublished(objective: Pick<AdminCreateTargetPublishObjective, "id" | "title">) {
  const [row] = await db
    .select({
      id: objectives.id,
      title: objectives.title,
      publishedAt: objectives.publishedAt,
    })
    .from(objectives)
    .where(or(eq(objectives.id, objective.id), eq(objectives.title, objective.title)))
    .limit(1);

  return Boolean(row?.publishedAt);
}

async function readObjectiveFromResponse(response: Response): Promise<AdminCreateTargetPublishObjective> {
  if (!response.ok()) {
    throw new Error(`目标接口请求失败: ${response.status()} ${response.url()}`);
  }

  const body = await readResponseBody(response);
  return objectiveFromUnknown((body as { objective?: unknown }).objective);
}

function objectiveFromUnknown(value: unknown): AdminCreateTargetPublishObjective {
  if (typeof value !== "object" || value === null) {
    throw new Error("目标接口响应缺少 objective");
  }

  const objective = value as Partial<AdminCreateTargetPublishObjective>;
  if (
    typeof objective.id !== "string" ||
    typeof objective.title !== "string" ||
    typeof objective.flowStatus !== "string" ||
    typeof objective.stage !== "string"
  ) {
    throw new Error("目标接口响应中的 objective 格式不完整");
  }

  return {
    id: objective.id,
    title: objective.title,
    flowStatus: objective.flowStatus,
    stage: objective.stage,
    publishedAt: typeof objective.publishedAt === "string" ? objective.publishedAt : null,
  };
}

function bountyHallBodyContainsObjective(body: unknown, objective: Pick<AdminCreateTargetPublishObjective, "id" | "title">) {
  if (typeof body !== "object" || body === null) {
    return false;
  }

  const containers = ["publicItems", "availableItems", "recruitmentItems", "objectiveOptions"]
    .flatMap((key) => {
      const value = (body as Record<string, unknown>)[key];
      return Array.isArray(value) ? value : [];
    });

  return containers.some((item) => {
    if (typeof item !== "object" || item === null) return false;
    const itemObjective = "objective" in item ? (item as { objective?: unknown }).objective : item;
    if (typeof itemObjective !== "object" || itemObjective === null) return false;
    const row = itemObjective as { id?: unknown; title?: unknown };
    return row.id === objective.id || row.title === objective.title;
  });
}

function cssAttributeValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
