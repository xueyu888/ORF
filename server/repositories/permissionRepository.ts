import { and, eq } from "drizzle-orm";
import { initialOrfState } from "../../src/data/initialOrfState";
import type { OrfStage, PermissionAction, PermissionResource, PermissionRule, UserRole } from "../../src/types/orf";
import { db } from "../db/client";
import { rolePermissions, teamMembers, teams } from "../db/schema";

export const permissionStages = ["goalSetting", "resultClaiming", "orfReestimate", "goalFrozen"] as const satisfies readonly OrfStage[];
export const permissionResources = ["objective", "result", "task", "subtask"] as const satisfies readonly PermissionResource[];
export const permissionActions = ["view", "create", "edit", "delete"] as const satisfies readonly PermissionAction[];
export const persistedPermissionRoles = ["member"] as const satisfies readonly UserRole[];

const permissionKey = (role: UserRole, stage: OrfStage, resource: PermissionResource) => `${role}:${stage}:${resource}`;

function defaultPermissionRulesForRole(role: UserRole): PermissionRule[] {
  if (role === "admin") {
    return [];
  }

  const initialRuleMap = new Map(initialOrfState.permissionRules.map((rule) => [permissionKey(rule.role, rule.stage, rule.resource), rule.actions]));

  return permissionStages.flatMap((stage) =>
    permissionResources.map((resource) => ({
      role,
      stage,
      resource,
      actions: normalizeActions(initialRuleMap.get(permissionKey(role, stage, resource)) ?? []),
    })),
  );
}

function normalizeActions(actions: readonly string[]): PermissionAction[] {
  return permissionActions.filter((action) => actions.includes(action));
}

function normalizePermissionRules(role: UserRole, rules: readonly PermissionRule[]): PermissionRule[] {
  const ruleMap = new Map(rules.filter((rule) => rule.role === role).map((rule) => [permissionKey(role, rule.stage, rule.resource), rule.actions]));

  return permissionStages.flatMap((stage) =>
    permissionResources.map((resource) => ({
      role,
      stage,
      resource,
      actions: normalizeActions(ruleMap.get(permissionKey(role, stage, resource)) ?? []),
    })),
  );
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
    .values(defaultRules.map((rule) => ({ teamId, role: rule.role, stage: rule.stage, resource: rule.resource, actions: rule.actions })))
    .onConflictDoNothing();
}

export async function getPermissionRulesForTeam(teamId: string): Promise<PermissionRule[]> {
  await ensureDefaultPermissionRules(teamId);

  const rows = await db.select().from(rolePermissions).where(eq(rolePermissions.teamId, teamId));
  const rulesByRole = new Map<UserRole, PermissionRule[]>();

  for (const role of persistedPermissionRoles) {
    const roleRows = rows.filter((row) => row.role === role);
    rulesByRole.set(
      role,
      normalizePermissionRules(
        role,
        roleRows.map((row) => ({
          role,
          stage: row.stage as OrfStage,
          resource: row.resource as PermissionResource,
          actions: normalizeActions(row.actions),
        })),
      ),
    );
  }

  return persistedPermissionRoles.flatMap((role) => rulesByRole.get(role) ?? defaultPermissionRulesForRole(role));
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
        stage: rule.stage,
        resource: rule.resource,
        actions: rule.actions,
      })),
    );
  });

  return getPermissionRulesForTeam(teamId);
}
