import { expect, type Locator, type Page } from "@playwright/test";
import { and, asc, eq } from "drizzle-orm";
import { normalizePermissionKeys, type PermissionKey } from "../../../../../../src/config/permissions";
import { initialOrfState } from "../../../../../../src/data/initialOrfState";
import type { PermissionRule } from "../../../../../../src/types/orf";
import { rolePermissions, teams } from "../../../../../../server/db/schema";
import { db } from "../../../../../_operators/testd-db-client";
import {
  permissionStorageResource,
  permissionStorageStage,
} from "../../../../../_operators/testd-permissions";
import type { MemberPermissionSnapshot } from "./member-create-target-forbidden.context";

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

export function topbarCreateObjectiveButton(page: Page) {
  return page.getByRole("button", { name: "新建目标", exact: true });
}

export function projectCreateObjectiveActions(page: Page): Locator {
  return page.getByLabel(/^(新增未归属目标|在.+中新增目标)$/);
}

export function objectiveDraftTitleInput(page: Page) {
  return page.getByLabel("编辑目标标题", { exact: true });
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
