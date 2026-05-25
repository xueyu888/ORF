import type { Page } from "@playwright/test";
import { eq, sql } from "drizzle-orm";
import { closeDb, db } from "../../../../server/db/client";
import { teamMembers, users } from "../../../../server/db/schema";
import { ORY_ADMIN_URL } from "../../../_operators/common.context";
import { findOryIdentityByEmail } from "../../../_operators/common.helpers";
import { normalizePermissionKeys, type PermissionKey } from "../../../../src/config/permissions";
import type { PermissionRule, UserRole } from "../../../../src/types/orf";
import type { AdminAccountRecord, PermissionRulesResult } from "./admin-permission.context";

export async function closeAdminPermissionTestDb() {
  await closeDb();
}

export async function adminAccountActive(email: string) {
  const account = await readAdminAccount(email);
  return account?.role === "admin" && account.status === "active";
}

export async function readAdminAccount(email: string): Promise<AdminAccountRecord | null> {
  const [row] = await db
    .select({
      userId: users.id,
      email: users.email,
      role: teamMembers.role,
      status: users.status,
      lastOnlineAt: users.lastOnlineAt,
    })
    .from(users)
    .innerJoin(teamMembers, eq(teamMembers.userId, users.id))
    .where(sql`lower(${users.email}) = ${email.toLowerCase()}`)
    .limit(1);

  if (!row || row.role !== "admin") {
    return null;
  }

  return {
    userId: row.userId,
    email: row.email ?? "",
    role: "admin",
    status: row.status,
    lastOnlineAt: row.lastOnlineAt,
  };
}

export async function restoreLastOnlineAt(userId: string, lastOnlineAt: string | null) {
  await db.update(users).set({ lastOnlineAt }).where(eq(users.id, userId));
}

export async function revokeOrySessionsByEmail(email: string) {
  const identity = await findOryIdentityByEmail(email);
  if (!identity) {
    return;
  }

  const response = await fetch(`${ORY_ADMIN_URL}/admin/identities/${encodeURIComponent(identity.id)}/sessions`, {
    method: "DELETE",
    headers: { accept: "application/json" },
  });

  if (!response.ok && response.status !== 404 && response.status !== 405) {
    throw new Error(`Ory session cleanup failed with ${response.status}: ${await response.text()}`);
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
