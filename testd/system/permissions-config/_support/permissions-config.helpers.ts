import type { Page } from "@playwright/test";
import { and, eq, sql } from "drizzle-orm";
import { normalizePermissionKeys, permissionKeys, type PermissionKey } from "../../../../src/config/permissions";
import { rolePermissions, users } from "../../../../server/db/schema";
import { saveUserPreferences } from "../../../../server/settings/personalSettings";
import type { PermissionRule, UserRole } from "../../../../src/types/orf";
import {
  getPermissionRulesForScope,
  permissionStorageResource,
  permissionStorageStage,
  runtimeScope,
} from "../../../_operators/testd-permissions";
import { db } from "../../../_operators/testd-db-client";
import type { CurrentAccessResult, PermissionRulesResult } from "./permissions-config.context";

export async function setDefaultLandingPathByEmail(email: string, path: string | null) {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${email.toLowerCase()}`);

  for (const row of rows) {
    await saveUserPreferences(row.id, { defaultLandingPath: path });
  }
}

export async function readPermissionRulesAsCurrentUser(page: Page): Promise<PermissionRulesResult> {
  return page.evaluate(async () => {
    const response = await fetch("/api/permissions", {
      credentials: "include",
    });
    return {
      status: response.status,
      body: await response.json().catch(() => ({})),
    };
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

export async function updateMemberPermissionRules(page: Page, rules: PermissionRule[]): Promise<PermissionRulesResult> {
  return page.evaluate(async (permissionRules) => {
    const response = await fetch("/api/permissions/member", {
      method: "PUT",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ permissionRules }),
    });
    return {
      status: response.status,
      body: await response.json().catch(() => ({})),
    };
  }, rules);
}

export async function readCurrentAccessAsUser(page: Page, email: string, password: string): Promise<CurrentAccessResult> {
  return page.evaluate(async ({ email: loginEmail, password: loginPassword }) => {
    const loginResponse = await fetch("/api/auth/login", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: loginEmail, password: loginPassword }),
    });

    if (!loginResponse.ok) {
      return {
        status: loginResponse.status,
        body: await loginResponse.json().catch(() => ({})),
      };
    }

    const accessResponse = await fetch("/api/me/access", {
      credentials: "include",
    });

    return {
      status: accessResponse.status,
      body: await accessResponse.json().catch(() => ({})),
    };
  }, { email, password });
}

export function toggleRolePermission(rules: PermissionRule[], role: UserRole, permissionKey: PermissionKey): PermissionRule[] {
  const current = rolePermissionKeys(rules, role);
  const next = current.includes(permissionKey)
    ? current.filter((key) => key !== permissionKey)
    : normalizePermissionKeys([...current, permissionKey]);

  return [...rules.filter((rule) => rule.role !== role), { role, permissions: next }];
}

export function rolePermissionKeys(rules: PermissionRule[], role: UserRole): PermissionKey[] {
  if (role === "admin") {
    return [...permissionKeys];
  }

  return normalizePermissionKeys(rules.find((rule) => rule.role === role)?.permissions ?? []);
}

export function systemPermissionKeys(): PermissionKey[] {
  return [...permissionKeys];
}
