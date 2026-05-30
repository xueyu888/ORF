import type { Page } from "@playwright/test";
import { normalizePermissionKeys, type PermissionKey } from "../../../../src/config/permissions";
import type { PermissionRule, UserRole } from "../../../../src/types/orf";
import type { PermissionRulesResult } from "./admin-permission.context";

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

export function toggleRolePermission(rules: PermissionRule[], role: UserRole, permissionKey: PermissionKey): PermissionRule[] {
  const current = memberPermissionKeys(rules, role);
  const next = current.includes(permissionKey)
    ? current.filter((key) => key !== permissionKey)
    : normalizePermissionKeys([...current, permissionKey]);

  return [...rules.filter((rule) => rule.role !== role), { role, permissions: next }];
}

export function memberPermissionKeys(rules: PermissionRule[], role: UserRole): PermissionKey[] {
  return normalizePermissionKeys(rules.find((rule) => rule.role === role)?.permissions ?? []);
}
