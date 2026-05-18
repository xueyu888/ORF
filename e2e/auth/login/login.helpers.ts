import type { BrowserContext, Page } from "@playwright/test";
import { and, eq, sql } from "drizzle-orm";
import { closeDb, db } from "../../../server/db/client";
import { teamMembers, teams, users } from "../../../server/db/schema";
import {
  ORF_SESSION_COOKIE,
  ORY_ADMIN_URL,
  TEST_EMAIL,
  TEST_NAME,
  TEST_PASSWORD,
  TEST_TEAM_ID,
  TEST_USER_ID,
  type BrowserAuthStorageState,
  type BrowserSession,
  type OryIdentity,
} from "./login.context";

export async function closeLoginTestDb() {
  await closeDb();
}

export async function clearBrowserState(page: Page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.clear();
      window.sessionStorage.clear();
    } catch {
      // Opaque origins such as about:blank can deny storage access.
    }
  });
  await page
    .evaluate(() => {
      try {
        window.localStorage.clear();
        window.sessionStorage.clear();
      } catch {
        // Opaque origins such as about:blank can deny storage access.
      }
    })
    .catch(() => undefined);
}

export async function readBrowserSession(page: Page): Promise<BrowserSession> {
  return page.evaluate(async () => {
    const response = await fetch("/api/auth/session", { credentials: "include" });
    return {
      status: response.status,
      body: await response.json(),
    };
  });
}

export async function readBrowserAuthStorageState(page: Page): Promise<BrowserAuthStorageState> {
  return page.evaluate(() => ({
    localStorageAuthKeys: Object.keys(window.localStorage).filter((key) => /auth|session|token|ory/i.test(key)),
    sessionStorageAuthKeys: Object.keys(window.sessionStorage).filter((key) => /auth|session|token|ory/i.test(key)),
  }));
}

export async function hasSessionCookie(context: BrowserContext) {
  const cookies = await context.cookies();
  return cookies.some((cookie) => cookie.name === ORF_SESSION_COOKIE && cookie.value.length > 0);
}

export async function isBackendReady(page: Page) {
  try {
    const response = await page.request.get("/health");
    if (!response.ok()) {
      return false;
    }

    const body = await response.json();
    return body?.ok === true && body?.service === "orf-api";
  } catch {
    return false;
  }
}

export async function isDatabaseReady() {
  try {
    await db.execute(sql`select 1`);
    return true;
  } catch {
    return false;
  }
}

export async function isOryAdminReady() {
  try {
    const response = await fetch(`${ORY_ADMIN_URL}/health/ready`, {
      headers: { accept: "application/json" },
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function findOryIdentityByEmail(email: string) {
  const identities = await oryAdminFetch<OryIdentity[]>(
    `/admin/identities?credentials_identifier=${encodeURIComponent(email)}`,
  );
  return identities.find((identity) => identity.traits?.email?.toLowerCase() === email.toLowerCase()) ?? null;
}

export async function upsertOryIdentity() {
  const existing = await findOryIdentityByEmail(TEST_EMAIL);
  const body = {
    schema_id: existing?.schema_id ?? "default",
    traits: {
      email: TEST_EMAIL,
      name: {
        first: TEST_NAME,
      },
    },
    credentials: {
      password: {
        config: {
          password: TEST_PASSWORD,
        },
      },
    },
    state: "active",
  };

  if (!existing) {
    return oryAdminFetch<OryIdentity>("/admin/identities", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  return oryAdminFetch<OryIdentity>(`/admin/identities/${encodeURIComponent(existing.id)}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function revokeIdentitySessions(identityId: string) {
  const response = await fetch(`${ORY_ADMIN_URL}/admin/identities/${encodeURIComponent(identityId)}/sessions`, {
    method: "DELETE",
    headers: { accept: "application/json" },
  });

  if (!response.ok && response.status !== 404 && response.status !== 405) {
    throw new Error(`Ory session cleanup failed with ${response.status}: ${await response.text()}`);
  }
}

export async function ensureTestTeam() {
  const [existingTeam] = await db.select({ id: teams.id }).from(teams).limit(1);
  if (existingTeam) {
    return existingTeam.id;
  }

  await db
    .insert(teams)
    .values({
      id: TEST_TEAM_ID,
      name: "登录测试团队",
      createdAt: today(),
    })
    .onConflictDoNothing();
  return TEST_TEAM_ID;
}

export async function upsertOrfMember(teamId: string) {
  const [existingByEmail] = await db
    .select({ id: users.id, lastLoginAt: users.lastLoginAt })
    .from(users)
    .where(sql`lower(${users.email}) = ${TEST_EMAIL}`)
    .limit(1);
  const [existingById] = await db
    .select({ id: users.id, lastLoginAt: users.lastLoginAt })
    .from(users)
    .where(eq(users.id, TEST_USER_ID))
    .limit(1);
  const existing = existingByEmail ?? existingById;
  const userId = existing?.id ?? TEST_USER_ID;
  const previousLastLoginAt = existing?.lastLoginAt ?? null;

  if (existing) {
    await db.update(users).set({ name: TEST_NAME, email: TEST_EMAIL }).where(eq(users.id, userId));
  } else {
    await db.insert(users).values({
      id: userId,
      name: TEST_NAME,
      email: TEST_EMAIL,
      createdAt: today(),
      lastLoginAt: null,
    });
  }

  await db
    .insert(teamMembers)
    .values({ teamId, userId, role: "member" })
    .onConflictDoUpdate({
      target: [teamMembers.teamId, teamMembers.userId],
      set: { role: "member" },
    });

  return { id: userId, previousLastLoginAt };
}

export async function restoreLastLoginAt(userId: string, lastLoginAt: string | null) {
  await db.update(users).set({ lastLoginAt }).where(eq(users.id, userId));
}

export async function readOrfMembership(userId: string, teamId: string) {
  const [membership] = await db
    .select({
      email: users.email,
      role: teamMembers.role,
      lastLoginAt: users.lastLoginAt,
    })
    .from(teamMembers)
    .innerJoin(users, eq(teamMembers.userId, users.id))
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)))
    .limit(1);

  return membership ?? null;
}

async function oryAdminFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${ORY_ADMIN_URL}${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...init.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`Ory Admin API failed with ${response.status}: ${await response.text()}`);
  }

  return response.json() as Promise<T>;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}
