import { expect } from "@playwright/test";
import { TEST_EMAIL, type ActionResult, type SetupState, type TestContext } from "./login.context";
import {
  findOryIdentityByEmail,
  hasSessionCookie,
  isBackendReady,
  isDatabaseReady,
  isOryAdminReady,
  readBrowserAuthStorageState,
  readBrowserSession,
  readOrfMembership,
} from "./login.helpers";

export async function B(ctx: TestContext) {
  await expect.poll(() => isBackendReady(ctx.page)).toBe(true);
  await expect.poll(() => isDatabaseReady()).toBe(true);
  await expect.poll(() => isOryAdminReady()).toBe(true);

  await ctx.page.goto("/bounties");
  await expect(ctx.page).toHaveURL(/\/auth$/);
  await expect.poll(() => readBrowserSession(ctx.page)).toMatchObject({
    status: 200,
    body: { authenticated: false, user: null },
  });
  await expect.poll(() => hasSessionCookie(ctx.context)).toBe(false);
  await expect.poll(() => readBrowserAuthStorageState(ctx.page)).toEqual({
    localStorageAuthKeys: [],
    sessionStorageAuthKeys: [],
  });
}

export async function S0(ctx: TestContext, setupState: SetupState) {
  const emailInput = ctx.page.getByLabel("Email");
  const passwordInput = ctx.page.getByLabel("Password", { exact: true });
  const signInButton = ctx.page.getByRole("button", { name: "Sign In" });

  await expect(ctx.page).toHaveURL(/\/auth$/);
  await expect(ctx.page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(emailInput).toBeVisible();
  await expect(emailInput).toHaveValue("");
  await expect(passwordInput).toBeVisible();
  await expect(passwordInput).toHaveValue("");
  await expect(signInButton).toBeVisible();
  await expect(signInButton).toBeEnabled();
  await expect.poll(() => readBrowserSession(ctx.page)).toMatchObject({
    status: 200,
    body: { authenticated: false, user: null },
  });
  await expect.poll(() => hasSessionCookie(ctx.context)).toBe(false);
  await expect.poll(async () => (await findOryIdentityByEmail(TEST_EMAIL))?.traits?.email ?? null).toBe(TEST_EMAIL);
  await assertOrfMemberMatches(setupState);
}

export async function S1(ctx: TestContext, setupState: SetupState, actionResult: ActionResult) {
  expect(actionResult.ok).toBe(true);
  expect(actionResult.status).toBe(200);
  expect(actionResult.body).toMatchObject({
    authenticated: true,
    user: { email: TEST_EMAIL, role: "member" },
  });

  await expect(ctx.page).toHaveURL(/\/bounties$/);
  await expect.poll(() => hasSessionCookie(ctx.context)).toBe(true);
  await expect.poll(() => readBrowserSession(ctx.page)).toMatchObject({
    status: 200,
    body: {
      authenticated: true,
      user: { email: TEST_EMAIL, role: "member" },
    },
  });
  await expect(ctx.page.getByLabel("主导航")).toBeVisible();
  await expect(ctx.page.getByLabel("当前用户")).toBeVisible();
  await expect(ctx.page.getByRole("button", { name: "退出登录" })).toBeVisible();
  await expect(ctx.page.getByRole("button", { name: "Sign In" })).toHaveCount(0);
  await assertOrfMemberMatches(setupState);
}

async function assertOrfMemberMatches(setupState: SetupState, options: { lastLoginAt?: string | null } = {}) {
  const expected: { email: string; role: string; lastLoginAt?: string | null } = {
    email: TEST_EMAIL,
    role: "member",
  };

  if ("lastLoginAt" in options) {
    expected.lastLoginAt = options.lastLoginAt;
  }

  await expect.poll(() => readOrfMembership(setupState.userId, setupState.teamId)).toMatchObject(expected);
}
