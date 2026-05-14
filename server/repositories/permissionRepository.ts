import { and, eq } from "drizzle-orm";
import { hasRolePermission, normalizePermissionKeys, permissionKeys, type PermissionKey } from "../../src/config/permissions";
import { initialOrfState } from "../../src/data/initialOrfState";
import type { PermissionRule, UserRole } from "../../src/types/orf";
import { db } from "../db/client";
import { rolePermissions, teamMembers, teams } from "../db/schema";

export { hasRolePermission, permissionKeys };

export const persistedPermissionRoles = ["member"] as const satisfies readonly UserRole[];
export const permissionStorageStage = "global";
export const permissionStorageResource = "permissionKeys";

function defaultPermissionRulesForRole(role: UserRole): PermissionRule[] {
  if (role === "admin") {
    return [];
  }

  const initialRule = initialOrfState.permissionRules.find((rule) => rule.role === role);
  return [{ role, permissions: normalizePermissionKeys(initialRule?.permissions ?? []) }];
}

function normalizePermissionRules(role: UserRole, rules: readonly PermissionRule[]): PermissionRule[] {
  if (role === "admin") {
    return [];
  }

  return [{ role, permissions: normalizePermissionKeys(rules.find((rule) => rule.role === role)?.permissions ?? []) }];
}

function permissionRulesFromRows(role: UserRole, rows: { stage: string; resource: string; actions: string[] }[]): PermissionRule[] {
  const storedRule = rows.find((row) => row.stage === permissionStorageStage && row.resource === permissionStorageResource);
  if (!storedRule) {
    return defaultPermissionRulesForRole(role);
  }

  return [{ role, permissions: normalizePermissionKeys(storedRule.actions) }];
}

export async function getPrimaryTeamIdForUser(userId: string): Promise<string | null> {
  const [membership] = await db.select({ teamId: teamMembers.teamId }).from(teamMembers).where(eq(teamMembers.userId, userId)).limit(1);
  if (membership) {
    return membership.teamId;
  }

  const [team] = await db.select({ id: teams.id }).from(teams).limit(1);
  return team?.id ?? null;
}

export async function ensureDefaultPermissionRules(teamId: string): Promise<void> {
  const defaultRules = persistedPermissionRoles.flatMap((role) => defaultPermissionRulesForRole(role));
  if (defaultRules.length === 0) {
    return;
  }

  await db
    .insert(rolePermissions)
    .values(
      defaultRules.map((rule) => ({
        teamId,
        role: rule.role,
        stage: permissionStorageStage,
        resource: permissionStorageResource,
        actions: rule.permissions,
      })),
    )
    .onConflictDoNothing();
}

export async function getPermissionRulesForTeam(teamId: string): Promise<PermissionRule[]> {
  await ensureDefaultPermissionRules(teamId);

  const rows = await db.select().from(rolePermissions).where(eq(rolePermissions.teamId, teamId));

  return persistedPermissionRoles.flatMap((role) =>
    permissionRulesFromRows(
      role,
      rows
        .filter((row) => row.role === role)
        .map((row) => ({
          stage: row.stage,
          resource: row.resource,
          actions: row.actions,
        })),
    ),
  );
}

export async function replaceRolePermissionRules(teamId: string, role: UserRole, rules: readonly PermissionRule[]): Promise<PermissionRule[]> {
  if (!(persistedPermissionRoles as readonly UserRole[]).includes(role)) {
    throw new Error(`Role permissions are not persisted for ${role}`);
  }

  const normalizedRules = normalizePermissionRules(role, rules);

  await db.transaction(async (tx) => {
    await tx.delete(rolePermissions).where(and(eq(rolePermissions.teamId, teamId), eq(rolePermissions.role, role)));

    await tx.insert(rolePermissions).values(
      normalizedRules.map((rule) => ({
        teamId,
        role: rule.role,
        stage: permissionStorageStage,
        resource: permissionStorageResource,
        actions: rule.permissions,
      })),
    );
  });

  return getPermissionRulesForTeam(teamId);
}

export async function getRolePermissionKeysForTeam(teamId: string, role: UserRole): Promise<PermissionKey[]> {
  const rules = await getPermissionRulesForTeam(teamId);
  return normalizePermissionKeys(rules.find((rule) => rule.role === role)?.permissions ?? []);
}
