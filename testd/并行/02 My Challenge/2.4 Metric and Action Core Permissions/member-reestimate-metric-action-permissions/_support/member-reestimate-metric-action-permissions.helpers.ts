import { expect, type Page } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { objectives, results, tasks } from "../../../../../../server/db/schema";
import { isObjectiveReestimateWindowOpen } from "../../../../../../src/domain/orfLifecycle";
import {
  deleteTestObjective,
  upsertTestObjective,
  type TestObjectiveFixtureRecord,
} from "../../../../../_operators/common.helpers";
import { db } from "../../../../../_operators/testd-db-client";
import {
  actionExistsForObjective,
  actionPrefixAbsent,
  challengeRow,
  clickRowMenuAction,
  deleteObjectivesByTitlePrefix,
  editActionTitle,
  editMetricTitle,
  metricExistsForObjective,
  metricPrefixAbsent,
  myChallengesContainsTitle,
  objectivePanel,
  objectivePrefixAbsent,
  openMyChallenges,
  readSessionUserName,
  startActionDelete,
  submitActionDraft,
  submitMetricDraft,
  confirmNextDelete,
} from "../../admin-metric-action-mutation-allowed/_support/admin-metric-action-mutation-allowed.helpers";
import type {
  ActionItemData,
  MetricItemData,
  ObjectiveStageTargetData,
  TestUserAccountRecord,
  MetricRecord,
} from "./member-reestimate-metric-action-permissions.context";

export {
  actionExistsForObjective,
  actionPrefixAbsent,
  challengeRow,
  clickRowMenuAction,
  confirmNextDelete,
  deleteObjectivesByTitlePrefix,
  editActionTitle,
  editMetricTitle,
  metricExistsForObjective,
  metricPrefixAbsent,
  myChallengesContainsTitle,
  objectivePanel,
  objectivePrefixAbsent,
  openMyChallenges,
  readSessionUserName,
  startActionDelete,
  submitActionDraft,
};

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
        body: await sessionResponse.json().catch(() => ({})),
      };
    });
    return response.status === 200 && response.body?.authenticated === true;
  }).toBe(true);
}

export async function clickMemberProposeMetric(page: Page, objectiveTitle: string) {
  const panel = objectivePanel(page, objectiveTitle);
  await expect(panel).toBeVisible();
  await panel.locator(".orf-objective-header").hover();
  await panel.locator(".orf-objective-header").getByRole("button", { name: "新增子级", exact: true }).click();
  await panel.locator(".orf-block-menu").getByRole("button", { name: "提出指标", exact: true }).click();
}

export async function clickObjectiveAddAction(page: Page, objectiveTitle: string) {
  const panel = objectivePanel(page, objectiveTitle);
  await expect(panel).toBeVisible();
  await panel.locator(".orf-objective-header").hover();
  await panel.locator(".orf-objective-header").getByRole("button", { name: "新增子级", exact: true }).click();
  await panel.locator(".orf-block-menu").getByRole("button", { name: "新增行动项", exact: true }).click();
}

export async function submitMemberMetricDraft(page: Page, title: string) {
  return submitMetricDraft(page, title);
}

export async function clickMetricDeleteForbidden(page: Page, title: string) {
  await clickRowMenuAction(page, title, "删除");
  await expect(challengeRow(page, title)).toBeVisible();
}

export async function deleteMetricRequestForbidden(page: Page, title: string) {
  const metric = await requiredMetricByTitle(title);
  const response = await page.evaluate(async (resultId) => {
    const deleteResponse = await fetch(`/api/results/${encodeURIComponent(resultId)}`, {
      method: "DELETE",
      credentials: "include",
    });
    return {
      status: deleteResponse.status,
      body: await deleteResponse.json().catch(() => ({})),
    };
  }, metric.id);

  if (response.status !== 403) {
    throw new Error(`普通成员删除指标应被拒绝: expected=403, actual=${response.status}`);
  }
  await expect.poll(() => metricExistsForObjectiveById(metric.id)).toBe(true);
  return response;
}

export async function prepareMemberReestimateObjective(input: {
  memberUser: TestUserAccountRecord;
  target: ObjectiveStageTargetData;
}): Promise<TestObjectiveFixtureRecord> {
  const record = await upsertTestObjective({
    teamId: input.memberUser.teamId,
    title: input.target.title,
    stage: input.target.stage,
    flowStatus: input.target.flowStatus,
    status: "On Track",
    challengers: [input.memberUser.name],
    challengerUserIds: [input.memberUser.userId],
    createdBy: input.memberUser.userId,
    updatedBy: input.memberUser.userId,
  });

  const now = new Date();
  await db
    .update(objectives)
    .set({
      acceptedAt: new Date(now.getTime() - 60 * 60 * 1000).toISOString(),
      confirmationDueAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      updatedBy: input.memberUser.userId,
      updatedAt: today(),
    })
    .where(eq(objectives.id, record.id));

  return record;
}

export async function prepareMetric(input: {
  memberUser: TestUserAccountRecord;
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
      teamId: input.memberUser.teamId,
      objectiveId: objective.id,
      title: input.metric.title,
      detail: "TestD isolated member metric fixture",
      uncertaintyLevel: input.metric.uncertaintyLevel,
      baseline: 0,
      current: 0,
      target: 100,
      unit: "%",
      direction: "increase",
      status: "On Track",
      confidence: 70,
      source: "memberProposed",
      definer: input.memberUser.name,
      definerUserId: input.memberUser.userId,
      uncertaintyScore: input.metric.uncertaintyScore,
      acceptedResult: input.metric.acceptedResult,
      reviewCadence: "weekly",
      sortOrder: 0,
      createdAt: todayValue,
      updatedAt: todayValue,
      createdBy: input.memberUser.userId,
      updatedBy: input.memberUser.userId,
    })
    .onConflictDoUpdate({
      target: results.id,
      set: {
        teamId: input.memberUser.teamId,
        objectiveId: objective.id,
        title: input.metric.title,
        detail: "TestD isolated member metric fixture",
        uncertaintyLevel: input.metric.uncertaintyLevel,
        uncertaintyScore: input.metric.uncertaintyScore,
        acceptedResult: input.metric.acceptedResult,
        updatedAt: todayValue,
        updatedBy: input.memberUser.userId,
      },
    });
}

export async function prepareAction(input: {
  memberUser: TestUserAccountRecord;
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
      teamId: input.memberUser.teamId,
      title: input.action.title,
      description: "TestD isolated member action fixture",
      status: input.action.status,
      priority: input.action.priority,
      assignee: input.memberUser.name,
      assigneeUserId: input.memberUser.userId,
      linkedObjectiveId: objective.id,
      dueDate: todayValue,
      tags: ["ORF"],
      createdAt: todayValue,
      updatedAt: todayValue,
      sortOrder: 0,
      createdBy: input.memberUser.userId,
      updatedBy: input.memberUser.userId,
      definitionContributorUserIds: [input.memberUser.userId],
    })
    .onConflictDoUpdate({
      target: tasks.id,
      set: {
        teamId: input.memberUser.teamId,
        title: input.action.title,
        description: "TestD isolated member action fixture",
        status: input.action.status,
        priority: input.action.priority,
        assignee: input.memberUser.name,
        assigneeUserId: input.memberUser.userId,
        linkedObjectiveId: objective.id,
        dueDate: todayValue,
        updatedAt: todayValue,
        updatedBy: input.memberUser.userId,
        definitionContributorUserIds: [input.memberUser.userId],
      },
    });
}

export async function objectiveHasReestimateMember(input: {
  title: string;
  memberUser: TestUserAccountRecord;
  stage: ObjectiveStageTargetData["stage"];
  flowStatus: ObjectiveStageTargetData["flowStatus"];
}) {
  const objective = await objectiveByTitle(input.title);
  return Boolean(
    objective &&
      objective.stage === input.stage &&
      objective.flowStatus === input.flowStatus &&
      objective.challengerUserIds.includes(input.memberUser.userId) &&
      isObjectiveReestimateWindowOpen(objective),
  );
}

export async function memberMetricMutationAllowed(input: { page: Page; objectiveTitle: string; memberUser: TestUserAccountRecord }) {
  const [sessionOk, objectiveOk] = await Promise.all([
    sessionMatchesMember(input.page, input.memberUser),
    objectiveHasReestimateMember({
      title: input.objectiveTitle,
      memberUser: input.memberUser,
      stage: "orfReestimate",
      flowStatus: "reestimating",
    }),
  ]);
  return sessionOk && objectiveOk;
}

export async function memberMetricDeleteForbidden(page: Page) {
  const response = await page.evaluate(async () => {
    const accessResponse = await fetch("/api/me/access", { credentials: "include" });
    return {
      status: accessResponse.status,
      body: await accessResponse.json().catch(() => ({})),
    };
  });
  const body = response.body as { capabilities?: Record<string, unknown>; user?: { role?: unknown } };
  return response.status === 200 && body.user?.role === "member" && body.capabilities?.["result.delete"] !== true;
}

export async function memberWorkItemMutationAllowed(input: {
  page: Page;
  objectiveTitle: string;
  memberUser: TestUserAccountRecord;
}) {
  return memberMetricMutationAllowed(input);
}

async function sessionMatchesMember(page: Page, memberUser: TestUserAccountRecord) {
  const response = await page.evaluate(async () => {
    const sessionResponse = await fetch("/api/auth/session", { credentials: "include" });
    return {
      status: sessionResponse.status,
      body: await sessionResponse.json().catch(() => ({})),
    };
  });
  return (
    response.status === 200 &&
    response.body?.authenticated === true &&
    response.body?.user?.email === memberUser.email &&
    response.body?.user?.role === "member"
  );
}

async function requiredObjectiveByTitle(title: string) {
  const objective = await objectiveByTitle(title);
  if (!objective) {
    throw new Error(`未找到本用例目标: ${title}`);
  }
  return objective;
}

async function objectiveByTitle(title: string) {
  const [row] = await db
    .select({
      id: objectives.id,
      title: objectives.title,
      stage: objectives.stage,
      flowStatus: objectives.flowStatus,
      challengerUserIds: objectives.challengerUserIds,
      confirmationDueAt: objectives.confirmationDueAt,
    })
    .from(objectives)
    .where(eq(objectives.title, title))
    .limit(1);
  return row ?? null;
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

async function metricExistsForObjectiveById(id: string) {
  const [row] = await db.select({ id: results.id }).from(results).where(eq(results.id, id)).limit(1);
  return Boolean(row);
}

export async function objectiveStageStill(input: {
  title: string;
  stage: ObjectiveStageTargetData["stage"];
  flowStatus: ObjectiveStageTargetData["flowStatus"];
}) {
  const row = await objectiveByTitle(input.title);
  return row?.stage === input.stage && row.flowStatus === input.flowStatus;
}

export async function removeObjectiveByPrefix(prefix: string) {
  const rows = await db.select({ id: objectives.id }).from(objectives).where(eq(objectives.title, prefix));
  for (const row of rows) {
    const deleted = await deleteTestObjective(row.id);
    if (!deleted) {
      await db.delete(objectives).where(eq(objectives.id, row.id));
    }
  }
  await deleteObjectivesByTitlePrefix(prefix);
}

export async function metricExistsForObjectiveTitle(input: { objectiveTitle: string; title: string }) {
  const [row] = await db
    .select({ id: results.id })
    .from(results)
    .innerJoin(objectives, eq(objectives.id, results.objectiveId))
    .where(and(eq(objectives.title, input.objectiveTitle), eq(results.title, input.title)))
    .limit(1);
  return Boolean(row);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 96);
}
