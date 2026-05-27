import type { BrowserContext, Page, Response } from "@playwright/test";
import { asc, eq, or, sql } from "drizzle-orm";
import { db } from "../../server/db/client";
import { teamMembers, teams, users } from "../../server/db/schema";
import type { UserRole, UserStatus } from "../../src/types/orf";
import { ORF_SESSION_COOKIE, ORY_ADMIN_URL, type BrowserAuthStorageState, type BrowserSession, type OryIdentity } from "./common.context";

export type TestUserAccountRecord = {
  userId: string;
  teamId: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  lastOnlineAt: string | null;
};

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
  const response = await page.request.get("/api/auth/session");
  return {
    status: response.status(),
    body: await response.json(),
  };
}

export async function readBrowserAuthStorageState(page: Page): Promise<BrowserAuthStorageState> {
  return page.evaluate(() => {
    const safeStorageKeys = (readStorage: () => Storage) => {
      try {
        return Object.keys(readStorage());
      } catch {
        return [];
      }
    };

    return {
      localStorageAuthKeys: safeStorageKeys(() => window.localStorage).filter((key) => /auth|session|token|ory/i.test(key)),
      sessionStorageAuthKeys: safeStorageKeys(() => window.sessionStorage).filter((key) => /auth|session|token|ory/i.test(key)),
    };
  });
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

export async function isFrontendReady(page: Page) {
  try {
    const response = await page.request.get("/");
    return response.ok();
  } catch {
    return false;
  }
}

export async function isFrontendAuthEntryReady(page: Page) {
  try {
    const response = await page.request.get("/auth");
    return response.ok();
  } catch {
    return false;
  }
}

export async function isSessionEndpointReady(page: Page) {
  try {
    const response = await page.request.get("/api/auth/session");
    if (response.status() !== 200) {
      return false;
    }

    const body = await response.json().catch(() => null);
    return typeof body?.authenticated === "boolean";
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

export async function isDatabaseSchemaCurrent() {
  try {
    await db.execute(sql`select id, email, ory_identity_id, status from users limit 0`);
    await db.execute(sql`select team_id, user_id, role from team_members limit 0`);
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

export async function isOryAdminPublicReady(page: Page) {
  if (!(await isOryAdminReady())) {
    return false;
  }

  try {
    const response = await page.request.get("/health/auth");
    if (!response.ok()) {
      return false;
    }

    const body = await response.json().catch(() => null);
    return body?.ok === true && body?.service === "orf-auth";
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

export async function upsertOryIdentityWithPassword(input: { email: string; name: string; password: string }) {
  const existing = await findOryIdentityByEmail(input.email);
  const body = {
    schema_id: existing?.schema_id ?? "default",
    traits: {
      email: input.email,
      name: {
        first: input.name,
      },
    },
    credentials: {
      password: {
        config: {
          password: input.password,
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

export async function oryIdentityPasswordAvailable(email: string) {
  const identity = await findOryIdentityByEmail(email);
  if (!identity) {
    return false;
  }

  const response = await oryAdminFetch<{
    credentials?: Record<string, unknown>;
  }>(`/admin/identities/${encodeURIComponent(identity.id)}`);
  return typeof response.credentials?.password === "object" && response.credentials.password !== null;
}

export async function deleteOryIdentityByEmail(email: string) {
  const identity = await findOryIdentityByEmail(email);
  if (!identity) {
    return;
  }

  const response = await fetch(`${ORY_ADMIN_URL}/admin/identities/${encodeURIComponent(identity.id)}`, {
    method: "DELETE",
    headers: { accept: "application/json" },
  });

  if (!response.ok && response.status !== 404) {
    throw new Error(`Ory identity delete failed with ${response.status}: ${await response.text()}`);
  }
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

export async function upsertTestUserAccount(input: {
  userId?: string;
  email: string;
  name: string;
  role: UserRole;
  status?: UserStatus;
  identityId?: string;
}) {
  const teamId = await ensureDefaultTeam();
  const [existingById] = input.userId ? await db.select({ id: users.id }).from(users).where(eq(users.id, input.userId)).limit(1) : [];
  const [existingByEmail] = existingById
    ? []
    : await db.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${input.email.toLowerCase()}`).limit(1);
  const userId = existingById?.id ?? existingByEmail?.id ?? input.userId ?? `user-${slug(input.email.split("@")[0] ?? "testd-user")}`;
  const status = input.status ?? "active";

  if (existingById || existingByEmail) {
    await db
      .update(users)
      .set({
        name: input.name,
        email: input.email,
        status,
        ...(input.identityId ? { oryIdentityId: input.identityId } : {}),
      })
      .where(eq(users.id, userId));
  } else {
    await db.insert(users).values({
      id: userId,
      name: input.name,
      email: input.email,
      status,
      oryIdentityId: input.identityId,
      createdAt: today(),
      lastOnlineAt: null,
    });
  }

  await db
    .insert(teamMembers)
    .values({ teamId, userId, role: input.role })
    .onConflictDoUpdate({
      target: [teamMembers.teamId, teamMembers.userId],
      set: { role: input.role },
    });

  return readTestUserAccount({ userId, role: input.role });
}

export async function readTestUserAccount(input: { email?: string; userId?: string; role?: UserRole }) {
  const rows = await readTestUserAccountRecords(input);
  return input.role ? rows.find((row) => row.role === input.role) ?? null : rows[0] ?? null;
}

export async function testUserAccountMatches(input: {
  email?: string;
  userId?: string;
  name?: string;
  role?: UserRole;
  status?: UserStatus;
}) {
  const account = await readTestUserAccount({ email: input.email, userId: input.userId, role: input.role });
  if (!account) {
    return false;
  }

  return (
    (input.email === undefined || account.email.toLowerCase() === input.email.toLowerCase()) &&
    (input.userId === undefined || account.userId === input.userId) &&
    (input.name === undefined || account.name === input.name) &&
    (input.role === undefined || account.role === input.role) &&
    (input.status === undefined || account.status === input.status)
  );
}

export async function restoreTestUserLastOnlineAt(account: TestUserAccountRecord | null | undefined) {
  if (!account) {
    return;
  }
  await db.update(users).set({ lastOnlineAt: account.lastOnlineAt }).where(eq(users.id, account.userId));
}

export async function deleteTestUserMemberships(input: { email?: string; emails?: string[]; userId?: string }) {
  const ids = await readTestUserIds(input);
  for (const id of ids) {
    await db.delete(teamMembers).where(eq(teamMembers.userId, id));
  }
}

export async function deleteTestUsers(input: { email?: string; emails?: string[]; userId?: string }) {
  const deadline = Date.now() + 10_000;
  let absentSince: number | null = null;

  while (Date.now() < deadline) {
    const ids = await readTestUserIds(input);
    if (ids.length === 0) {
      absentSince ??= Date.now();
      if (Date.now() - absentSince >= 750) {
        return;
      }
    } else {
      absentSince = null;
      for (const id of ids) {
        await db.delete(teamMembers).where(eq(teamMembers.userId, id));
        await db.delete(users).where(eq(users.id, id));
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  const ids = await readTestUserIds(input);
  if (ids.length > 0) {
    throw new Error(`测试用户未能清理干净: ${ids.join(", ")}`);
  }
}

export async function oryAdminFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
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

export async function readResponseBody(response: Response) {
  const headers = response.headers();
  const contentType = headers["content-type"] ?? "";

  if (contentType.includes("application/json")) {
    return response.json().catch(() => null);
  }

  return response.text().catch(() => null);
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

async function readTestUserAccountRecords(input: { email?: string; userId?: string; role?: UserRole }): Promise<TestUserAccountRecord[]> {
  const rows = await db
    .select({
      userId: users.id,
      teamId: teamMembers.teamId,
      name: users.name,
      email: users.email,
      role: teamMembers.role,
      status: users.status,
      lastOnlineAt: users.lastOnlineAt,
    })
    .from(users)
    .innerJoin(teamMembers, eq(teamMembers.userId, users.id))
    .where(userPredicate(input));

  return rows
    .filter((row) => row.role === "admin" || row.role === "member")
    .map((row) => ({
      userId: row.userId,
      teamId: row.teamId,
      name: row.name,
      email: row.email ?? "",
      role: row.role === "admin" ? "admin" : "member",
      status: row.status,
      lastOnlineAt: row.lastOnlineAt,
    }));
}

async function readTestUserIds(input: { email?: string; emails?: string[]; userId?: string }) {
  const rows = await db.select({ id: users.id }).from(users).where(userPredicate(input));
  return rows.map((row) => row.id);
}

function userPredicate(input: { email?: string; emails?: string[]; userId?: string; role?: UserRole }) {
  const emails = [...(input.email ? [input.email] : []), ...(input.emails ?? [])].map((email) => email.toLowerCase());
  const predicates = [
    input.userId ? eq(users.id, input.userId) : undefined,
    ...emails.map((email) => sql`lower(${users.email}) = ${email}`),
  ].filter((predicate): predicate is NonNullable<typeof predicate> => Boolean(predicate));

  if (predicates.length === 0) {
    throw new Error("用户查询必须提供 email、emails 或 userId");
  }

  return predicates.length === 1 ? predicates[0] : or(...predicates);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
