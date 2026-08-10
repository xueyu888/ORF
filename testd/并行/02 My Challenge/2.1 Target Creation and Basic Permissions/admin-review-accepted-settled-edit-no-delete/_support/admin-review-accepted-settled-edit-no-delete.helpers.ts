import { expect, type Locator, type Page, type Response } from "@playwright/test";
import { eq, ilike } from "drizzle-orm";
import { objectives } from "../../../../../../server/db/schema";
import type { PermissionKey } from "../../../../../../src/config/permissions";
import type { ObjectiveFlowStatus, OrfStage } from "../../../../../../src/types/orf";
import {
  deleteTestObjective,
  applicationConfirmDialog,
  readResponseBody,
  upsertTestObjective,
  type TestObjectiveFixtureRecord,
} from "../../../../../_operators/common.helpers";
import { db } from "../../../../../_operators/testd-db-client";
import type {
  LockedDeleteResult,
  ObjectiveRecord,
  ObjectiveStageTargetData,
  TestUserAccountRecord,
} from "./admin-review-accepted-settled-edit-no-delete.context";

const RESPONSE_TIMEOUT_MS = 5_000;

type PendingLockedDelete = {
  title: string;
  responsePromise: Promise<Response>;
};

const pendingLockedDeletesByPage = new WeakMap<Page, PendingLockedDelete[]>();
const lockedDeleteResultsByPage = new WeakMap<Page, LockedDeleteResult[]>();

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

export async function openMyChallenges(page: Page) {
  await page.goto("/tasks");
  await expect(page).toHaveURL(/\/tasks(?:[?#].*)?$/);
}

export async function selectChallengeScope(page: Page, label: string) {
  await challengeScopeTab(page, label).click();
  await expect(challengeScopeTab(page, label)).toHaveClass(/orf-scope-tab-active/);
}

export function challengeScopeTab(page: Page, label: string) {
  return page.getByRole("button", { name: label, exact: true });
}

export function objectivePanel(page: Page, title: string): Locator {
  return page.locator(".orf-objective-panel").filter({ hasText: title }).first();
}

export function objectiveTitleEditInput(page: Page) {
  return page.getByLabel("编辑目标标题", { exact: true });
}

export function deleteFailedToast(page: Page) {
  return page
    .locator(".orf-toast-card")
    .filter({ hasText: /目标删除失败|Objective cannot be deleted after submission or settlement|deleted after submission/i });
}

export async function clickObjectiveMenuAction(page: Page, title: string, action: "编辑" | "删除") {
  const panel = objectivePanel(page, title);
  await expect(panel).toBeVisible();
  await panel.hover();
  await panel.getByRole("button", { name: /打开块菜单/ }).first().click();
  await panel.locator(".orf-block-menu").getByRole("button", { name: action, exact: true }).click();
}

export async function editObjectiveTitle(page: Page, input: { oldTitle: string; newTitle: string }) {
  const objective = await requiredObjectiveByTitle(input.oldTitle);
  const responsePromise = waitForObjectivePatchResponse(page, objective.id).then(readObjectiveFromResponse);

  await objectiveTitleEditInput(page).fill(input.newTitle);
  await objectiveTitleEditInput(page).press("Enter");

  const updated = await responsePromise;
  if (updated.title !== input.newTitle) {
    throw new Error(`目标标题修改结果不匹配: expected=${input.newTitle}, actual=${updated.title}`);
  }
  await expect(objectivePanel(page, input.newTitle)).toBeVisible();
  return updated;
}

export async function startLockedObjectiveDelete(page: Page, title: string) {
  const objective = await requiredObjectiveByTitle(title);
  const responsePromise = waitForObjectiveDeleteResponse(page, objective.id);
  await clickObjectiveMenuAction(page, title, "删除");
  const dialog = applicationConfirmDialog(page, "删除工作项");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".orf-confirm-dialog-description")).toContainText(title);

  const queue = pendingLockedDeletesByPage.get(page) ?? [];
  queue.push({ title, responsePromise });
  pendingLockedDeletesByPage.set(page, queue);
}

export async function confirmNextLockedObjectiveDelete(page: Page) {
  const queue = pendingLockedDeletesByPage.get(page) ?? [];
  const pending = queue.shift();
  if (!pending) {
    throw new Error("不存在待确认的删除目标弹窗");
  }

  const dialog = applicationConfirmDialog(page, "删除工作项");
  await dialog.getByRole("button", { name: "确认删除", exact: true }).click();
  const response = await pending.responsePromise;
  await expect(objectivePanel(page, pending.title)).toBeVisible();

  const resultQueue = lockedDeleteResultsByPage.get(page) ?? [];
  resultQueue.push({
    title: pending.title,
    status: response.status(),
    body: await readResponseBody(response),
  });
  lockedDeleteResultsByPage.set(page, resultQueue);
}

export function takeNextLockedDeleteResult(page: Page, title: string): LockedDeleteResult {
  const queue = lockedDeleteResultsByPage.get(page) ?? [];
  const result = queue.shift();
  if (!result) {
    throw new Error("不存在待断言的删除目标响应");
  }
  if (result.title !== title) {
    throw new Error(`删除目标响应顺序不匹配: expected=${title}, actual=${result.title}`);
  }
  return result;
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

export async function adminObjectiveContentEditGranted(page: Page) {
  const response = await page.evaluate(async () => {
    const sessionResponse = await fetch("/api/auth/session", { credentials: "include" });
    return {
      status: sessionResponse.status,
      body: await sessionResponse.json().catch(() => ({})),
    };
  });

  return response.status === 200 && response.body?.authenticated === true && response.body?.user?.role === "admin";
}

export async function adminPermissionGranted(page: Page, permissionKey: PermissionKey) {
  const response = await page.evaluate(
    async (key) => {
      const accessResponse = await fetch("/api/me/access", { credentials: "include" });
      return {
        key,
        status: accessResponse.status,
        body: await accessResponse.json().catch(() => ({})),
      };
    },
    permissionKey,
  );

  if (response.status !== 200) {
    return false;
  }

  const body = response.body as {
    capabilities?: Record<string, unknown>;
    user?: { role?: unknown };
  };
  if (body.user?.role === "admin") {
    return true;
  }

  const capabilities = body.capabilities;
  return capabilities?.[response.key] === true;
}

export async function prepareStageObjective(input: {
  adminUser: TestUserAccountRecord;
  target: ObjectiveStageTargetData;
}): Promise<TestObjectiveFixtureRecord> {
  return upsertTestObjective({
    teamId: input.adminUser.teamId,
    title: input.target.title,
    stage: input.target.stage,
    flowStatus: input.target.flowStatus,
    status: "On Track",
    createdBy: input.adminUser.userId,
    updatedBy: input.adminUser.userId,
  });
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
  return (await objectiveCountByTitlePrefix(prefix)) === 0;
}

export async function objectiveCountByTitlePrefix(prefix: string) {
  const rows = await db.select({ id: objectives.id }).from(objectives).where(ilike(objectives.title, `${escapeLike(prefix)}%`));
  return rows.length;
}

export async function objectiveAbsentByTitle(title: string) {
  return (await objectiveByTitle(title)) === null;
}

export async function objectiveHasStageAndFlowStatus(input: {
  title: string;
  stage: OrfStage;
  flowStatus: ObjectiveFlowStatus;
}) {
  const row = await objectiveByTitle(input.title);
  return row?.stage === input.stage && row.flowStatus === input.flowStatus;
}

export async function myChallengesContainsObjectiveTitle(page: Page, title: string) {
  const response = await page.evaluate(async () => {
    const tasksResponse = await fetch("/api/tasks-page", { credentials: "include" });
    return {
      status: tasksResponse.status,
      body: await tasksResponse.json().catch(() => ({})),
    };
  });
  return response.status === 200 && bodyContainsObjectiveTitle(response.body, title);
}

export async function requiredObjectiveByTitle(title: string): Promise<ObjectiveRecord> {
  const objective = await objectiveByTitle(title);
  if (!objective) {
    throw new Error(`未找到本用例目标: ${title}`);
  }
  return objective;
}

function objectiveByTitle(title: string) {
  return db
    .select({
      id: objectives.id,
      title: objectives.title,
      stage: objectives.stage,
      flowStatus: objectives.flowStatus,
    })
    .from(objectives)
    .where(eq(objectives.title, title))
    .limit(1)
    .then((rows) => rows[0] ?? null);
}

function waitForObjectivePatchResponse(page: Page, objectiveId: string) {
  return page.waitForResponse(
    (response) =>
      response.request().method().toUpperCase() === "PATCH" &&
      response.url().endsWith(`/api/objectives/${encodeURIComponent(objectiveId)}`),
    { timeout: RESPONSE_TIMEOUT_MS },
  );
}

function waitForObjectiveDeleteResponse(page: Page, objectiveId: string) {
  return page.waitForResponse(
    (response) =>
      response.request().method().toUpperCase() === "DELETE" &&
      response.url().endsWith(`/api/objectives/${encodeURIComponent(objectiveId)}`),
    { timeout: RESPONSE_TIMEOUT_MS },
  );
}

async function readObjectiveFromResponse(response: Response): Promise<ObjectiveRecord> {
  if (!response.ok()) {
    throw new Error(`目标接口请求失败: ${response.status()} ${response.url()}`);
  }

  const body = await readResponseBody(response);
  const value = (body as { objective?: unknown }).objective;
  if (typeof value !== "object" || value === null) {
    throw new Error("目标接口响应缺少 objective");
  }

  const objective = value as Partial<ObjectiveRecord>;
  if (
    typeof objective.id !== "string" ||
    typeof objective.title !== "string" ||
    !isOrfStage(objective.stage) ||
    !isObjectiveFlowStatus(objective.flowStatus)
  ) {
    throw new Error("目标接口响应中的 objective 格式不完整");
  }

  return {
    id: objective.id,
    title: objective.title,
    stage: objective.stage,
    flowStatus: objective.flowStatus,
  };
}

function bodyContainsObjectiveTitle(value: unknown, title: string): boolean {
  if (Array.isArray(value)) {
    return value.some((item) => bodyContainsObjectiveTitle(item, title));
  }
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  if (record.title === title) {
    return true;
  }
  return Object.values(record).some((child) => bodyContainsObjectiveTitle(child, title));
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function isOrfStage(value: unknown): value is OrfStage {
  return value === "goalSetting" || value === "resultClaiming" || value === "orfReestimate" || value === "goalFrozen";
}

function isObjectiveFlowStatus(value: unknown): value is ObjectiveFlowStatus {
  return (
    value === "candidate" ||
    value === "open" ||
    value === "applying" ||
    value === "recruiting" ||
    value === "reestimating" ||
    value === "frozen" ||
    value === "submitted" ||
    value === "revisionRequired" ||
    value === "accepted" ||
    value === "settled" ||
    value === "closed"
  );
}
