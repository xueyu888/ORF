import type { Page } from "@playwright/test";
import { and, eq, sql } from "drizzle-orm";
import { normalizePermissionKeys, type PermissionKey } from "../../../../src/config/permissions";
import { rolePermissions, users } from "../../../../server/db/schema";
import { saveUserPreferences } from "../../../../server/settings/personalSettings";
import type { PermissionRule, UserRole } from "../../../../src/types/orf";
import { db } from "../../../_operators/testd-db-client";
import {
  getPermissionRulesForScope,
  permissionStorageResource,
  permissionStorageStage,
  runtimeScope,
} from "../../../_operators/testd-permissions";
import { upsertTestObjective, type TestObjectiveFixtureRecord } from "../../../_operators/common.helpers";
import type { CurrentAccessResult, PermissionRulesResult } from "./permissions-effect.context";

export async function setDefaultLandingPathByEmail(email: string, path: string | null) {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${email.toLowerCase()}`);

  for (const row of rows) {
    await saveUserPreferences(row.id, { defaultLandingPath: path });
  }
}

export async function prepareCommentObjective(input: {
  authorName: string;
  authorUserId: string;
  id: string;
  memberName: string;
  memberUserId: string;
  teamId: string;
  title: string;
}): Promise<TestObjectiveFixtureRecord> {
  return upsertTestObjective({
    id: input.id,
    teamId: input.teamId,
    title: input.title,
    stage: "orfReestimate",
    flowStatus: "reestimating",
    status: "On Track",
    challengers: [input.memberName, input.authorName],
    challengerUserIds: [input.memberUserId, input.authorUserId],
    assignedChallengers: [input.memberName, input.authorName],
    assignedChallengerUserIds: [input.memberUserId, input.authorUserId],
    createdBy: input.authorUserId,
    updatedBy: input.authorUserId,
  });
}

export async function readPermissionRulesByTeamId(teamId: string): Promise<PermissionRule[]> {
  return getPermissionRulesForScope(runtimeScope(teamId));
}

export async function updateMemberPermissionRulesByTeamId(teamId: string, rules: PermissionRule[]): Promise<PermissionRulesResult> {
  const memberRules = rules.filter((rule) => rule.role === "member");

  await db.transaction(async (tx) => {
    await tx
      .delete(rolePermissions)
      .where(and(eq(rolePermissions.teamId, teamId), eq(rolePermissions.role, "member")));

    await tx.insert(rolePermissions).values(
      memberRules.map((rule) => ({
        teamId,
        role: rule.role,
        stage: permissionStorageStage,
        resource: permissionStorageResource,
        actions: normalizePermissionKeys(rule.permissions),
      })),
    );
  });

  return {
    status: 200,
    body: {
      permissionRules: await readPermissionRulesByTeamId(teamId),
    },
  };
}

export function rolePermissionKeys(rules: PermissionRule[], role: UserRole): PermissionKey[] {
  if (role === "admin") {
    throw new Error("本用例只比较 member 角色权限");
  }

  return normalizePermissionKeys(rules.find((rule) => rule.role === role)?.permissions ?? []);
}

export function setRolePermission(
  rules: PermissionRule[],
  role: "member",
  permissionKey: PermissionKey,
  allowed: boolean,
): PermissionRule[] {
  const current = rolePermissionKeys(rules, role);
  const next = allowed
    ? normalizePermissionKeys([...current, permissionKey])
    : current.filter((key) => key !== permissionKey);

  return [...rules.filter((rule) => rule.role !== role), { role, permissions: next }];
}

export async function readCurrentAccess(page: Page): Promise<CurrentAccessResult> {
  return page.evaluate(async () => {
    const response = await fetch("/api/me/access", {
      credentials: "include",
    });
    return {
      status: response.status,
      body: await response.json().catch(() => ({})),
    };
  });
}
