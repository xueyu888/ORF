import { and, eq } from "drizzle-orm";
import { hasRolePermission, normalizePermissionKeys, permissionKeys, type PermissionKey } from "../../src/config/permissions";
import type { PermissionRule, UserRole } from "../../src/types/orf";
import { db } from "../db/client";
import { rolePermissions } from "../db/schema";
import type { RuntimeScope } from "./runtimeScope";
import { runtimeScopeStorageId } from "./runtimeScope";

export { hasRolePermission, permissionKeys };

export const persistedPermissionRoles = ["member"] as const satisfies readonly UserRole[];
export const permissionStorageStage = "global";
export const permissionStorageResource = "permissionKeys";

export class PermissionConfigurationMissingError extends Error {
  statusCode = 503;

  constructor(scopeId: string, role: UserRole) {
    super(`Permission configuration is missing for scope ${scopeId} and role ${role}`);
    this.name = "PermissionConfigurationMissingError";
  }
}

function normalizePermissionRules(role: UserRole, rules: readonly PermissionRule[]): PermissionRule[] {
  if (role === "admin") {
    return [];
  }

  return [{ role, permissions: normalizePermissionKeys(rules.find((rule) => rule.role === role)?.permissions ?? []) }];
}

export async function getPermissionRulesForScope(scope: RuntimeScope): Promise<PermissionRule[]> {
  const storageScopeId = runtimeScopeStorageId(scope);
  const rows = await db
    .select({ actions: rolePermissions.actions, role: rolePermissions.role })
    .from(rolePermissions)
    .where(
      and(
        eq(rolePermissions.teamId, storageScopeId),
        eq(rolePermissions.stage, permissionStorageStage),
        eq(rolePermissions.resource, permissionStorageResource),
      ),
    );

  return persistedPermissionRoles.map((role) => {
    const storedRule = rows.find((row) => row.role === role);
    if (!storedRule) {
      throw new PermissionConfigurationMissingError(storageScopeId, role);
    }
    return { role, permissions: normalizePermissionKeys(storedRule.actions) };
  });
}

export async function replaceRolePermissionRules(scope: RuntimeScope, role: UserRole, rules: readonly PermissionRule[]): Promise<PermissionRule[]> {
  if (!(persistedPermissionRoles as readonly UserRole[]).includes(role)) {
    throw new Error(`Role permissions are not persisted for ${role}`);
  }

  const normalizedRules = normalizePermissionRules(role, rules);
  const storageScopeId = runtimeScopeStorageId(scope);

  await db.transaction(async (tx) => {
    await tx.delete(rolePermissions).where(and(eq(rolePermissions.teamId, storageScopeId), eq(rolePermissions.role, role)));

    await tx.insert(rolePermissions).values(
      normalizedRules.map((rule) => ({
        teamId: storageScopeId,
        role: rule.role,
        stage: permissionStorageStage,
        resource: permissionStorageResource,
        actions: rule.permissions,
      })),
    );
  });

  return normalizedRules;
}

export async function getRolePermissionKeysForScope(scope: RuntimeScope, role: UserRole): Promise<PermissionKey[]> {
  const rules = await getPermissionRulesForScope(scope);
  return normalizePermissionKeys(rules.find((rule) => rule.role === role)?.permissions ?? []);
}
