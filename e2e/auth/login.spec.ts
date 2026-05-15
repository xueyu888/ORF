import { expect, test, type Page } from "@playwright/test";
import { and, eq, sql } from "drizzle-orm";
import { closeDb, db } from "../../server/db/client";
import { teamMembers, teams, users } from "../../server/db/schema";

const ORY_ADMIN_URL = (process.env.ORY_ADMIN_URL ?? "http://127.0.0.1:4434").replace(/\/+$/, "");
const ORF_SESSION_COOKIE = "orf_ory_session";
const TEST_EMAIL = "orf-login-e2e@orf.local";
const TEST_PASSWORD = "OrfLoginE2E!2026";
const TEST_NAME = "ORF Login E2E";
const TEST_USER_ID = "user-orf-login-e2e";
const TEST_TEAM_ID = "team-orf-login-e2e";

type OryIdentity = {
  id: string;
  schema_id?: string;
  traits?: {
    email?: string;
    name?: {
      first?: string;
      last?: string;
    };
  };
};

type BrowserSession = {
  status: number;
  body: {
    authenticated: boolean;
    user: null | {
      email: string;
      role: string;
    };
  };
};

test.describe("登录测试用例", () => {
  test.afterAll(async () => {
    await closeDb();
  });

  test("普通成员可以使用正确邮箱和密码登录 ORF", async ({ context, page }) => {
    const setup = await setupLoginState();

    try {
      await clearBrowserState(page);
      await context.clearCookies();
      await page.goto("/auth");

      const emailInput = page.getByLabel("Email");
      const passwordInput = page.getByRole("textbox", { name: "Password" });
      const signInButton = page.getByRole("button", { name: "Sign In" });

      await expect(page).toHaveURL(/\/auth$/);
      await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
      await expect(emailInput).toBeVisible();
      await expect(emailInput).toHaveValue("");
      await expect(passwordInput).toBeVisible();
      await expect(passwordInput).toHaveValue("");
      await expect(signInButton).toBeVisible();
      await expect(signInButton).toBeEnabled();
      await expect(await readBrowserSession(page)).toMatchObject({
        status: 200,
        body: { authenticated: false },
      });
      await expect.poll(() => hasSessionCookie(context)).toBe(false);
      await expect.poll(() => findOryIdentityByEmail(TEST_EMAIL)).not.toBeNull();
      await expect.poll(() => readOrfMembership(setup.userId, setup.teamId)).toMatchObject({
        email: TEST_EMAIL,
        role: "member",
      });

      await emailInput.fill(TEST_EMAIL);
      await passwordInput.fill(TEST_PASSWORD);
      const loginResponsePromise = page.waitForResponse(
        (response) => response.url().endsWith("/api/auth/login") && response.request().method() === "POST",
      );
      await signInButton.click();
      const loginResponse = await loginResponsePromise;
      expect(loginResponse.ok()).toBe(true);
      await expect(loginResponse.json()).resolves.toMatchObject({
        authenticated: true,
        user: { email: TEST_EMAIL, role: "member" },
      });

      await expect(page).toHaveURL(/\/bounties$/);
      await expect.poll(() => hasSessionCookie(context)).toBe(true);
      await expect(await readBrowserSession(page)).toMatchObject({
        status: 200,
        body: {
          authenticated: true,
          user: { email: TEST_EMAIL, role: "member" },
        },
      });
      await expect(page.getByLabel("主导航")).toBeVisible();
      await expect(page.getByLabel("当前用户")).toBeVisible();
      await expect(page.getByRole("button", { name: "退出登录" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Sign In" })).toHaveCount(0);
      await expect.poll(() => readOrfMembership(setup.userId, setup.teamId)).toMatchObject({
        email: TEST_EMAIL,
        role: "member",
      });
    } finally {
      await cleanLoginState(page, setup);
      await expect(await readBrowserSession(page)).toMatchObject({
        status: 200,
        body: { authenticated: false },
      });
      await expect.poll(() => hasSessionCookie(context)).toBe(false);
      await page.goto("/bounties");
      await expect(page).toHaveURL(/\/auth$/);
      await expect.poll(() => findOryIdentityByEmail(TEST_EMAIL)).not.toBeNull();
      await expect.poll(() => readOrfMembership(setup.userId, setup.teamId)).toMatchObject({
        email: TEST_EMAIL,
        role: "member",
        lastLoginAt: setup.previousLastLoginAt,
      });
    }
  });
});

async function setupLoginState() {
  const identity = await upsertOryIdentity();
  await revokeIdentitySessions(identity.id);

  const teamId = await ensureTestTeam();
  const user = await upsertOrfMember(teamId);

  return {
    identityId: identity.id,
    teamId,
    userId: user.id,
    previousLastLoginAt: user.previousLastLoginAt,
  };
}

async function cleanLoginState(page: Page, setup: Awaited<ReturnType<typeof setupLoginState>>) {
  await page
    .evaluate(async () => {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    })
    .catch(() => undefined);
  await page.context().clearCookies();
  await clearBrowserState(page);
  await restoreLastLoginAt(setup.userId, setup.previousLastLoginAt);
  await revokeIdentitySessions(setup.identityId).catch(() => undefined);
}

async function clearBrowserState(page: Page) {
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

async function readBrowserSession(page: Page): Promise<BrowserSession> {
  return page.evaluate(async () => {
    const response = await fetch("/api/auth/session", { credentials: "include" });
    return {
      status: response.status,
      body: await response.json(),
    };
  });
}

async function hasSessionCookie(context: Parameters<Parameters<typeof test>[1]>[0]["context"]) {
  const cookies = await context.cookies();
  return cookies.some((cookie) => cookie.name === ORF_SESSION_COOKIE && cookie.value.length > 0);
}

async function findOryIdentityByEmail(email: string) {
  const identities = await oryAdminFetch<OryIdentity[]>(
    `/admin/identities?credentials_identifier=${encodeURIComponent(email)}`,
  );
  return identities.find((identity) => identity.traits?.email?.toLowerCase() === email.toLowerCase()) ?? null;
}

async function upsertOryIdentity() {
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

async function revokeIdentitySessions(identityId: string) {
  const response = await fetch(`${ORY_ADMIN_URL}/admin/identities/${encodeURIComponent(identityId)}/sessions`, {
    method: "DELETE",
    headers: { accept: "application/json" },
  });

  if (!response.ok && response.status !== 404 && response.status !== 405) {
    throw new Error(`Ory session cleanup failed with ${response.status}: ${await response.text()}`);
  }
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

async function ensureTestTeam() {
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

async function upsertOrfMember(teamId: string) {
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

async function restoreLastLoginAt(userId: string, lastLoginAt: string | null) {
  await db.update(users).set({ lastLoginAt }).where(eq(users.id, userId));
}

async function readOrfMembership(userId: string, teamId: string) {
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

function today() {
  return new Date().toISOString().slice(0, 10);
}
