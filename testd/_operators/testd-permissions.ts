import { eq } from "drizzle-orm";
import { normalizePermissionKeys } from "../../src/config/permissions";
import { initialOrfState } from "../../src/data/initialOrfState";
import type { PermissionRule, UserRole } from "../../src/types/orf";
import { rolePermissions } from "../../server/db/schema";
import { db } from "./testd-db-client";

type RuntimeScope = {
  id: string;
};

export const persistedPermissionRoles = ["member"] as const satisfies readonly UserRole[];
export const permissionStorageStage = "global";
export const permissionStorageResource = "permissionKeys";

export function runtimeScope(id: string): RuntimeScope {
  return { id };
}

export function runtimeScopeStorageId(scope: RuntimeScope): string {
  return scope.id;
}

function defaultPermissionRulesForRole(role: UserRole): PermissionRule[] {
  if (role === "admin") {
    return [];
  }

  const initialRule = initialOrfState.permissionRules.find((rule) => rule.role === role);
  return [{ role, permissions: normalizePermissionKeys(initialRule?.permissions ?? []) }];
}

function permissionRulesFromRows(role: UserRole, rows: { stage: string; resource: string; actions: string[] }[]): PermissionRule[] {
  const storedRule = rows.find((row) => row.stage === permissionStorageStage && row.resource === permissionStorageResource);
  if (!storedRule) {
    return defaultPermissionRulesForRole(role);
  }

  return [{ role, permissions: normalizePermissionKeys(storedRule.actions) }];
}

async function ensureDefaultPermissionRules(scope: RuntimeScope): Promise<void> {
  const defaultRules = persistedPermissionRoles.flatMap((role) => defaultPermissionRulesForRole(role));
  if (defaultRules.length === 0) {
    return;
  }
  const storageScopeId = runtimeScopeStorageId(scope);

  await db
    .insert(rolePermissions)
    .values(
      defaultRules.map((rule) => ({
        teamId: storageScopeId,
        role: rule.role,
        stage: permissionStorageStage,
        resource: permissionStorageResource,
        actions: rule.permissions,
      })),
    )
    .onConflictDoNothing();
}

export async function getPermissionRulesForScope(scope: RuntimeScope): Promise<PermissionRule[]> {
  await ensureDefaultPermissionRules(scope);

  const rows = await db.select().from(rolePermissions).where(eq(rolePermissions.teamId, runtimeScopeStorageId(scope)));

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
