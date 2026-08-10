import { expect, type Locator, type Page, type Response } from "@playwright/test";
import { and, eq, ilike } from "drizzle-orm";
import { objectives, results, tasks } from "../../../../../../server/db/schema";
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
  ActionItemData,
  ActionRecord,
  MetricItemData,
  MetricRecord,
  ObjectiveRecord,
  ObjectiveStageTargetData,
  TestUserAccountRecord,
} from "./admin-metric-action-mutation-allowed.context";

const RESPONSE_TIMEOUT_MS = 7_500;

type PendingDelete = {
  title: string;
  responsePromise: Promise<Response>;
};

const pendingDeletesByPage = new WeakMap<Page, PendingDelete[]>();

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
        body: await sessionResponse.json().catch(() => ({})),
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

export function challengeRow(page: Page, title: string): Locator {
  return page.locator(".orf-challenge-row").filter({ hasText: title }).first();
}

export async function addMetricToObjective(page: Page, input: { objectiveTitle: string; title: string }): Promise<MetricRecord> {
  await clickObjectiveAddAction(page, input.objectiveTitle, "新增指标");
  return submitMetricDraft(page, input.title);
}

export async function addActionToObjective(page: Page, input: { objectiveTitle: string; title: string }): Promise<ActionRecord> {
  await clickObjectiveAddAction(page, input.objectiveTitle, "新增行动项");
  return submitActionDraft(page, input.title);
}

export async function clickRowMenuAction(page: Page, title: string, action: "编辑" | "删除") {
  const row = challengeRow(page, title);
  await expect(row).toBeVisible();
  await row.hover();
  await row.getByRole("button", { name: /打开块菜单/ }).first().click();
  await row.locator(".orf-block-menu").getByRole("button", { name: action, exact: true }).click();
}

export async function editMetricTitle(page: Page, input: { oldTitle: string; newTitle: string }) {
  const metric = await requiredMetricByTitle(input.oldTitle);
  const responsePromise = waitForResultPatchResponse(page, metric.id);
  await page.getByLabel("编辑指标标题", { exact: true }).fill(input.newTitle);
  await page.getByLabel("编辑指标标题", { exact: true }).press("Enter");
  await requireOkResponse(await responsePromise, "指标修改接口请求失败");
  await expect(challengeRow(page, input.newTitle)).toBeVisible();
}

export async function editActionTitle(page: Page, input: { oldTitle: string; newTitle: string }) {
  const action = await requiredActionByTitle(input.oldTitle);
  const responsePromise = waitForTaskPatchResponse(page, action.id);
  await page.getByLabel("编辑行动项标题", { exact: true }).fill(input.newTitle);
  await page.getByLabel("编辑行动项标题", { exact: true }).press("Enter");
  await requireOkResponse(await responsePromise, "行动项修改接口请求失败");
  await expect(challengeRow(page, input.newTitle)).toBeVisible();
}

export async function startMetricDelete(page: Page, title: string) {
  const metric = await requiredMetricByTitle(title);
  await startRowDelete(page, title, waitForResultDeleteResponse(page, metric.id));
}

export async function startActionDelete(page: Page, title: string) {
  const action = await requiredActionByTitle(title);
  await startRowDelete(page, title, waitForTaskDeleteResponse(page, action.id));
}

export async function confirmNextDelete(page: Page, noun: "指标" | "行动项") {
  const queue = pendingDeletesByPage.get(page) ?? [];
  const pending = queue.shift();
  if (!pending) {
    throw new Error(`不存在待确认的删除${noun}弹窗`);
  }

  const dialog = applicationConfirmDialog(page, "删除工作项");
  await dialog.getByRole("button", { name: "确认删除", exact: true }).click();
  await requireOkResponse(await pending.responsePromise, `删除${noun}接口请求失败`);
  await expect(challengeRow(page, pending.title)).toHaveCount(0);
}

async function startRowDelete(page: Page, title: string, responsePromise: Promise<Response>) {
  await clickRowMenuAction(page, title, "删除");
  const dialog = applicationConfirmDialog(page, "删除工作项");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".orf-confirm-dialog-description")).toContainText(title);

  const queue = pendingDeletesByPage.get(page) ?? [];
  queue.push({ title, responsePromise });
  pendingDeletesByPage.set(page, queue);
}

export async function clickObjectiveAddAction(page: Page, objectiveTitle: string, label: "新增指标" | "新增行动项") {
  const panel = objectivePanel(page, objectiveTitle);
  await expect(panel).toBeVisible();
  await panel.locator(".orf-objective-header").hover();
  await panel.locator(".orf-objective-header").getByRole("button", { name: "新增子级", exact: true }).click();
  await panel.locator(".orf-block-menu").getByRole("button", { name: label, exact: true }).click();
}

export async function submitMetricDraft(page: Page, title: string): Promise<MetricRecord> {
  const responsePromise = waitForResultCreateResponse(page);
  await page.getByLabel("编辑指标标题", { exact: true }).fill(title);
  await page.getByLabel("编辑指标标题", { exact: true }).press("Enter");
  const metric = await readMetricFromResponse(await responsePromise);
  if (metric.title !== title) {
    throw new Error(`新增指标标题不匹配: expected=${title}, actual=${metric.title}`);
  }
  await expect(challengeRow(page, title)).toBeVisible();
  return metric;
}

export async function submitActionDraft(page: Page, title: string): Promise<ActionRecord> {
  const responsePromise = waitForTaskCreateResponse(page);
  await page.getByLabel("编辑行动项标题", { exact: true }).fill(title);
  await page.getByLabel("编辑行动项标题", { exact: true }).press("Enter");
  const action = await readActionFromResponse(await responsePromise);
  if (action.title !== title) {
    throw new Error(`新增行动项标题不匹配: expected=${title}, actual=${action.title}`);
  }
  await expect(challengeRow(page, title)).toBeVisible();
  return action;
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

export async function adminPermissionsGranted(page: Page, permissionKeys: PermissionKey[]) {
  const response = await page.evaluate(async () => {
    const accessResponse = await fetch("/api/me/access", { credentials: "include" });
    return {
      status: accessResponse.status,
      body: await accessResponse.json().catch(() => ({})),
    };
  });

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

  return permissionKeys.every((key) => body.capabilities?.[key] === true);
}

export async function adminCanMutateWorkItemsForObjective(page: Page, objectiveTitle: string) {
  const [objective] = await db
    .select({
      flowStatus: objectives.flowStatus,
    })
    .from(objectives)
    .where(eq(objectives.title, objectiveTitle))
    .limit(1);
  if (!objective || !canMutateWorkItemsByFlowStatus(objective.flowStatus)) {
    return false;
  }

  const response = await page.evaluate(async () => {
    const sessionResponse = await fetch("/api/auth/session", { credentials: "include" });
    return {
      status: sessionResponse.status,
      body: await sessionResponse.json().catch(() => ({})),
    };
  });
  return response.status === 200 && response.body?.authenticated === true && response.body?.user?.role === "admin";
}

export async function myChallengesContainsTitle(page: Page, title: string) {
  const response = await page.evaluate(async () => {
    const tasksResponse = await fetch("/api/tasks-page", { credentials: "include" });
    return {
      status: tasksResponse.status,
      body: await tasksResponse.json().catch(() => ({})),
    };
  });
  return response.status === 200 && bodyContainsTitle(response.body, title);
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

export async function prepareMetric(input: {
  adminUser: TestUserAccountRecord;
  metric: MetricItemData;
  objective: ObjectiveStageTargetData;
}) {
  const objective = await requiredObjectiveByTitle(input.objective.title);
  const todayValue = today();
  const id = `res-${slug(input.metric.title)}`;
  await db
    .insert(results)
    .values({
      id,
      teamId: input.adminUser.teamId,
      objectiveId: objective.id,
      title: input.metric.title,
      detail: "TestD isolated metric fixture",
      uncertaintyLevel: input.metric.uncertaintyLevel,
      baseline: 0,
      current: 0,
      target: 100,
      unit: "%",
      direction: "increase",
      status: "On Track",
      confidence: 70,
      source: "managerDefined",
      definer: input.adminUser.name,
      definerUserId: input.adminUser.userId,
      uncertaintyScore: input.metric.uncertaintyScore,
      acceptedResult: input.metric.acceptedResult,
      reviewCadence: "weekly",
      sortOrder: 0,
      createdAt: todayValue,
      updatedAt: todayValue,
      createdBy: input.adminUser.userId,
      updatedBy: input.adminUser.userId,
    })
    .onConflictDoUpdate({
      target: results.id,
      set: {
        teamId: input.adminUser.teamId,
        objectiveId: objective.id,
        title: input.metric.title,
        detail: "TestD isolated metric fixture",
        uncertaintyLevel: input.metric.uncertaintyLevel,
        uncertaintyScore: input.metric.uncertaintyScore,
        acceptedResult: input.metric.acceptedResult,
        updatedAt: todayValue,
        updatedBy: input.adminUser.userId,
      },
    });
}

export async function prepareAction(input: {
  adminUser: TestUserAccountRecord;
  action: ActionItemData;
  objective: ObjectiveStageTargetData;
}) {
  const objective = await requiredObjectiveByTitle(input.objective.title);
  const todayValue = today();
  const id = `task-${slug(input.action.title)}`;
  await db
    .insert(tasks)
    .values({
      id,
      teamId: input.adminUser.teamId,
      title: input.action.title,
      description: "TestD isolated action fixture",
      status: input.action.status,
      priority: input.action.priority,
      assignee: input.adminUser.name,
      assigneeUserId: input.adminUser.userId,
      linkedObjectiveId: objective.id,
      dueDate: todayValue,
      tags: ["ORF"],
      createdAt: todayValue,
      updatedAt: todayValue,
      sortOrder: 0,
      createdBy: input.adminUser.userId,
      updatedBy: input.adminUser.userId,
      definitionContributorUserIds: [input.adminUser.userId],
    })
    .onConflictDoUpdate({
      target: tasks.id,
      set: {
        teamId: input.adminUser.teamId,
        title: input.action.title,
        description: "TestD isolated action fixture",
        status: input.action.status,
        priority: input.action.priority,
        assignee: input.adminUser.name,
        assigneeUserId: input.adminUser.userId,
        linkedObjectiveId: objective.id,
        dueDate: todayValue,
        updatedAt: todayValue,
        updatedBy: input.adminUser.userId,
        definitionContributorUserIds: [input.adminUser.userId],
      },
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

export async function metricPrefixAbsent(prefix: string) {
  const rows = await db.select({ id: results.id }).from(results).where(ilike(results.title, `${escapeLike(prefix)}%`));
  return rows.length === 0;
}

export async function actionPrefixAbsent(prefix: string) {
  const rows = await db.select({ id: tasks.id }).from(tasks).where(ilike(tasks.title, `${escapeLike(prefix)}%`));
  return rows.length === 0;
}

export async function objectiveHasStageAndFlowStatus(input: {
  title: string;
  stage: OrfStage;
  flowStatus: ObjectiveFlowStatus;
}) {
  const row = await objectiveByTitle(input.title);
  return row?.stage === input.stage && row.flowStatus === input.flowStatus;
}

export async function metricExistsForObjective(input: { objectiveTitle: string; title: string }) {
  return (await metricByObjectiveTitle(input)) !== null;
}

export async function actionExistsForObjective(input: { objectiveTitle: string; title: string }) {
  return (await actionByObjectiveTitle(input)) !== null;
}

async function requiredObjectiveByTitle(title: string): Promise<ObjectiveRecord> {
  const objective = await objectiveByTitle(title);
  if (!objective) {
    throw new Error(`未找到本用例目标: ${title}`);
  }
  return objective;
}

async function requiredMetricByTitle(title: string): Promise<MetricRecord> {
  const [row] = await db
    .select({
      id: results.id,
      objectiveId: results.objectiveId,
      title: results.title,
    })
    .from(results)
    .where(eq(results.title, title))
    .limit(1);
  if (!row) {
    throw new Error(`未找到本用例指标: ${title}`);
  }
  return row;
}

async function requiredActionByTitle(title: string): Promise<ActionRecord> {
  const [row] = await db
    .select({
      id: tasks.id,
      linkedObjectiveId: tasks.linkedObjectiveId,
      title: tasks.title,
    })
    .from(tasks)
    .where(eq(tasks.title, title))
    .limit(1);
  if (!row) {
    throw new Error(`未找到本用例行动项: ${title}`);
  }
  return row;
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

async function metricByObjectiveTitle(input: { objectiveTitle: string; title: string }) {
  const [row] = await db
    .select({ id: results.id })
    .from(results)
    .innerJoin(objectives, eq(objectives.id, results.objectiveId))
    .where(and(eq(objectives.title, input.objectiveTitle), eq(results.title, input.title)))
    .limit(1);
  return row ?? null;
}

async function actionByObjectiveTitle(input: { objectiveTitle: string; title: string }) {
  const [row] = await db
    .select({ id: tasks.id })
    .from(tasks)
    .innerJoin(objectives, eq(objectives.id, tasks.linkedObjectiveId))
    .where(and(eq(objectives.title, input.objectiveTitle), eq(tasks.title, input.title)))
    .limit(1);
  return row ?? null;
}

function waitForResultCreateResponse(page: Page) {
  return page.waitForResponse(
    (response) => response.request().method().toUpperCase() === "POST" && response.url().endsWith("/api/results"),
    { timeout: RESPONSE_TIMEOUT_MS },
  );
}

function waitForTaskCreateResponse(page: Page) {
  return page.waitForResponse(
    (response) => response.request().method().toUpperCase() === "POST" && response.url().endsWith("/api/tasks"),
    { timeout: RESPONSE_TIMEOUT_MS },
  );
}

function waitForResultPatchResponse(page: Page, resultId: string) {
  return page.waitForResponse(
    (response) =>
      response.request().method().toUpperCase() === "PATCH" &&
      response.url().endsWith(`/api/results/${encodeURIComponent(resultId)}`),
    { timeout: RESPONSE_TIMEOUT_MS },
  );
}

function waitForTaskPatchResponse(page: Page, taskId: string) {
  return page.waitForResponse(
    (response) =>
      response.request().method().toUpperCase() === "PATCH" &&
      response.url().endsWith(`/api/tasks/${encodeURIComponent(taskId)}`),
    { timeout: RESPONSE_TIMEOUT_MS },
  );
}

function waitForResultDeleteResponse(page: Page, resultId: string) {
  return page.waitForResponse(
    (response) =>
      response.request().method().toUpperCase() === "DELETE" &&
      response.url().endsWith(`/api/results/${encodeURIComponent(resultId)}`),
    { timeout: RESPONSE_TIMEOUT_MS },
  );
}

function waitForTaskDeleteResponse(page: Page, taskId: string) {
  return page.waitForResponse(
    (response) =>
      response.request().method().toUpperCase() === "DELETE" &&
      response.url().endsWith(`/api/tasks/${encodeURIComponent(taskId)}`),
    { timeout: RESPONSE_TIMEOUT_MS },
  );
}

async function readMetricFromResponse(response: Response): Promise<MetricRecord> {
  await requireOkResponse(response, "指标创建接口请求失败");
  const body = await readResponseBody(response);
  const value = (body as { result?: unknown }).result;
  if (typeof value !== "object" || value === null) {
    throw new Error("指标创建接口响应缺少 result");
  }
  const result = value as Partial<MetricRecord>;
  if (typeof result.id !== "string" || typeof result.objectiveId !== "string" || typeof result.title !== "string") {
    throw new Error("指标创建接口响应中的 result 格式不完整");
  }
  return {
    id: result.id,
    objectiveId: result.objectiveId,
    title: result.title,
  };
}

async function readActionFromResponse(response: Response): Promise<ActionRecord> {
  await requireOkResponse(response, "行动项创建接口请求失败");
  const body = await readResponseBody(response);
  const value = (body as { task?: unknown }).task;
  if (typeof value !== "object" || value === null) {
    throw new Error("行动项创建接口响应缺少 task");
  }
  const task = value as Partial<ActionRecord>;
  if (typeof task.id !== "string" || typeof task.linkedObjectiveId !== "string" || typeof task.title !== "string") {
    throw new Error("行动项创建接口响应中的 task 格式不完整");
  }
  return {
    id: task.id,
    linkedObjectiveId: task.linkedObjectiveId,
    title: task.title,
  };
}

async function requireOkResponse(response: Response, message: string) {
  if (!response.ok()) {
    throw new Error(`${message}: ${response.status()} ${response.url()}`);
  }
}

function bodyContainsTitle(value: unknown, title: string): boolean {
  if (Array.isArray(value)) {
    return value.some((item) => bodyContainsTitle(item, title));
  }
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  if (record.title === title) {
    return true;
  }
  return Object.values(record).some((child) => bodyContainsTitle(child, title));
}

function canMutateWorkItemsByFlowStatus(flowStatus: ObjectiveFlowStatus) {
  return flowStatus === "candidate" || flowStatus === "reestimating";
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 96);
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}
