import { expect, type Page } from "@playwright/test";
import { and, asc, eq, ilike } from "drizzle-orm";
import { normalizePermissionKeys, type PermissionKey } from "../../../../../../src/config/permissions";
import { initialOrfState } from "../../../../../../src/data/initialOrfState";
import type { ObjectiveFlowStatus, OrfStage, PermissionRule } from "../../../../../../src/types/orf";
import { objectives, rolePermissions, teams } from "../../../../../../server/db/schema";
import {
  deleteTestObjective,
  upsertTestObjective,
  type TestObjectiveFixtureRecord,
  type TestUserAccountRecord,
} from "../../../../../_operators/common.helpers";
import { db } from "../../../../../_operators/testd-db-client";
import {
  permissionStorageResource,
  permissionStorageStage,
} from "../../../../../_operators/testd-permissions";
import type {
  ObjectiveEditUiResult,
  MemberPermissionSnapshot,
  ObjectiveDeleteUiResult,
  ObjectiveMutationRequestResult,
  ObjectiveStageTargetData,
} from "./member-target-mutation-forbidden-all-stages.context";

const memberRole = "member" as const;

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

export function objectiveTitleEditInput(page: Page) {
  return page.getByLabel("编辑目标标题", { exact: true });
}

export function permissionToast(page: Page, text: string) {
  return page.locator(".orf-toast-card").filter({ hasText: text });
}

export async function clearPermissionToasts(page: Page) {
  const closeButtons = page.locator(".orf-toast-card").getByRole("button", { name: "关闭提示", exact: true });
  while (await closeButtons.count()) {
    await closeButtons.first().click();
  }
}

export async function clickObjectiveMenuAction(page: Page, title: string, action: "编辑" | "删除") {
  const panel = objectivePanel(page, title);
  await expect(panel).toBeVisible();
  await panel.hover();
  await panel.getByRole("button", { name: "打开块菜单", exact: true }).first().click();
  await panel.locator(".orf-block-menu").getByRole("button", { name: action, exact: true }).click();
}

export async function clickEditForStageTargets(page: Page, targets: readonly ObjectiveStageTargetData[]): Promise<ObjectiveEditUiResult> {
  let deniedNoticeCount = 0;
  for (const target of targets) {
    await clearPermissionToasts(page);
    await clickObjectiveMenuAction(page, target.title, "编辑");
    await expect(permissionToast(page, "只有指挥官可以编辑目标")).toHaveCount(1);
    deniedNoticeCount += 1;
  }
  return { targetCount: targets.length, deniedNoticeCount };
}

export async function clickDeleteForStageTargets(page: Page, targets: readonly ObjectiveStageTargetData[]): Promise<ObjectiveDeleteUiResult> {
  let deniedNoticeCount = 0;
  for (const target of targets) {
    await clearPermissionToasts(page);
    await clickObjectiveMenuAction(page, target.title, "删除");
    await expect(permissionToast(page, "没有删除目标权限")).toHaveCount(1);
    deniedNoticeCount += 1;
  }
  const dialogCount = await page.getByRole("alertdialog").count();
  return { targetCount: targets.length, deniedNoticeCount, dialogCount };
}

export async function recordMemberPermissionSnapshot(): Promise<MemberPermissionSnapshot> {
  return {
    role: memberRole,
    permissionRules: await readMemberPermissionRules(),
  };
}

export async function removeMemberPermission(permissionKey: PermissionKey) {
  const currentRules = await readMemberPermissionRules();
  const currentPermissions = currentRules.find((rule) => rule.role === memberRole)?.permissions ?? [];
  await writeMemberPermissionRules([
    {
      role: memberRole,
      permissions: normalizePermissionKeys(currentPermissions.filter((key) => key !== permissionKey)),
    },
  ]);
}

export async function restoreMemberPermissionSnapshot(snapshot: MemberPermissionSnapshot | undefined) {
  if (!snapshot) {
    return;
  }
  await writeMemberPermissionRules(snapshot.permissionRules);
}

export async function memberPermissionDenied(page: Page, permissionKey: PermissionKey) {
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

  const capabilities = (response.body as { capabilities?: Record<string, unknown> }).capabilities;
  if (capabilities && typeof capabilities[permissionKey] === "boolean") {
    return capabilities[permissionKey] === false;
  }

  const permissions = (response.body as { permissions?: unknown }).permissions;
  return Array.isArray(permissions) && !permissions.includes(permissionKey);
}

export async function memberObjectiveContentEditDenied(page: Page) {
  const response = await page.evaluate(async () => {
    const sessionResponse = await fetch("/api/auth/session", { credentials: "include" });
    return {
      status: sessionResponse.status,
      body: await sessionResponse.json().catch(() => ({})),
    };
  });

  return response.status === 200 && response.body?.authenticated === true && response.body?.user?.role !== "admin";
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

export async function objectiveCountByTitlePrefix(prefix: string) {
  const rows = await db.select({ id: objectives.id }).from(objectives).where(ilike(objectives.title, `${escapeLike(prefix)}%`));
  return rows.length;
}

export async function objectiveAbsentByTitle(title: string) {
  return (await objectiveByTitle(title)) === null;
}

export async function objectivePrefixAbsent(prefix: string) {
  return (await objectiveCountByTitlePrefix(prefix)) === 0;
}

export async function prepareStageObjective(input: {
  memberUser: TestUserAccountRecord;
  target: ObjectiveStageTargetData;
}): Promise<TestObjectiveFixtureRecord> {
  return upsertTestObjective({
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
}

export async function objectiveHasStageAndFlowStatus(input: {
  title: string;
  stage: OrfStage;
  flowStatus: ObjectiveFlowStatus;
}) {
  const row = await objectiveByTitle(input.title);
  return row?.stage === input.stage && row.flowStatus === input.flowStatus;
}

export async function patchAllStageObjectiveTitles(
  page: Page,
  input: {
    targets: readonly ObjectiveStageTargetData[];
    modifiedTitle: string;
  },
): Promise<ObjectiveMutationRequestResult[]> {
  const rows = await objectivesByStageTargets(input.targets);
  return page.evaluate(
    async ({ modifiedTitle, objectiveIds }) => {
      const results: ObjectiveMutationRequestResult[] = [];
      for (const objectiveId of objectiveIds) {
        const response = await fetch(`/api/objectives/${encodeURIComponent(objectiveId)}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ title: modifiedTitle }),
        });
        results.push({ objectiveId, status: response.status, forbidden: response.status === 403 });
      }
      return results;
    },
    {
      modifiedTitle: input.modifiedTitle,
      objectiveIds: rows.map((row) => row.id),
    },
  );
}

export async function deleteAllStageObjectivesByApi(
  page: Page,
  targets: readonly ObjectiveStageTargetData[],
): Promise<ObjectiveMutationRequestResult[]> {
  const rows = await objectivesByStageTargets(targets);
  return page.evaluate(async ({ objectiveIds }) => {
    const results: ObjectiveMutationRequestResult[] = [];
    for (const objectiveId of objectiveIds) {
      const response = await fetch(`/api/objectives/${encodeURIComponent(objectiveId)}`, {
        method: "DELETE",
        credentials: "include",
      });
      results.push({ objectiveId, status: response.status, forbidden: response.status === 403 });
    }
    return results;
  }, { objectiveIds: rows.map((row) => row.id) });
}

export function allMutationResultsForbidden(value: unknown) {
  return Array.isArray(value) && value.length === 4 && value.every((item) => {
    return typeof item === "object" && item !== null && (item as ObjectiveMutationRequestResult).forbidden === true;
  });
}

export function noDeleteConfirmDialog(value: unknown) {
  return typeof value === "object" && value !== null && (value as ObjectiveDeleteUiResult).dialogCount === 0;
}

export function allEditUiResultsForbidden(value: unknown) {
  if (typeof value !== "object" || value === null) return false;
  const result = value as ObjectiveEditUiResult;
  return result.targetCount === 4 && result.deniedNoticeCount === result.targetCount;
}

export function allDeleteUiResultsForbidden(value: unknown) {
  if (typeof value !== "object" || value === null) return false;
  const result = value as ObjectiveDeleteUiResult;
  return result.targetCount === 4 && result.deniedNoticeCount === result.targetCount;
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

async function objectivesByStageTargets(targets: readonly ObjectiveStageTargetData[]) {
  const rows: Array<{ id: string; title: string }> = [];
  for (const target of targets) {
    const row = await objectiveByTitle(target.title);
    if (!row) {
      throw new Error(`未找到本用例目标: ${target.title}`);
    }
    rows.push({ id: row.id, title: row.title });
  }
  return rows;
}

async function readMemberPermissionRules(): Promise<PermissionRule[]> {
  const teamId = await ensureDefaultTeam();
  await ensureDefaultMemberPermissionRule(teamId);

  const rows = await db
    .select({
      actions: rolePermissions.actions,
    })
    .from(rolePermissions)
    .where(
      and(
        eq(rolePermissions.teamId, teamId),
        eq(rolePermissions.role, memberRole),
        eq(rolePermissions.stage, permissionStorageStage),
        eq(rolePermissions.resource, permissionStorageResource),
      ),
    )
    .limit(1);

  return [{
    role: memberRole,
    permissions: normalizePermissionKeys(rows[0]?.actions ?? defaultMemberPermissionKeys()),
  }];
}

async function writeMemberPermissionRules(rules: readonly PermissionRule[]) {
  const teamId = await ensureDefaultTeam();
  const permissions = normalizePermissionKeys(rules.find((rule) => rule.role === memberRole)?.permissions ?? []);

  await db
    .insert(rolePermissions)
    .values({
      teamId,
      role: memberRole,
      stage: permissionStorageStage,
      resource: permissionStorageResource,
      actions: permissions,
    })
    .onConflictDoUpdate({
      target: [rolePermissions.teamId, rolePermissions.role, rolePermissions.stage, rolePermissions.resource],
      set: { actions: permissions },
    });
}

async function ensureDefaultMemberPermissionRule(teamId: string) {
  await db
    .insert(rolePermissions)
    .values({
      teamId,
      role: memberRole,
      stage: permissionStorageStage,
      resource: permissionStorageResource,
      actions: defaultMemberPermissionKeys(),
    })
    .onConflictDoNothing();
}

function defaultMemberPermissionKeys() {
  return normalizePermissionKeys(initialOrfState.permissionRules.find((rule) => rule.role === memberRole)?.permissions ?? []);
}

async function ensureDefaultTeam() {
  const [existing] = await db.select({ id: teams.id }).from(teams).orderBy(asc(teams.id)).limit(1);
  if (existing) {
    return existing.id;
  }

  const id = "team-testd-default";
  await db
    .insert(teams)
    .values({
      id,
      name: "TestD Default Team",
      createdAt: today(),
    })
    .onConflictDoNothing();
  return id;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function escapeLike(value: string) {
  return value.replace(/[%_\\]/g, "\\$&");
}
