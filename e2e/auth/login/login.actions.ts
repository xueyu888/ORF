import { expect } from "@playwright/test";
import {
  TEST_EMAIL,
  TEST_PASSWORD,
  type ActionResult,
  type BrowserSession,
  type SetupState,
  type TestContext,
} from "./login.context";
import {
  clearBrowserState,
  ensureTestTeam,
  restoreLastLoginAt,
  revokeIdentitySessions,
  upsertOrfMember,
  upsertOryIdentity,
} from "./login.helpers";

export async function setup(ctx: TestContext): Promise<SetupState> {
  const setupState = await setupLoginState();

  await setupLoginPage(ctx);
  return setupState;
}

export async function action(ctx: TestContext, _setupState: SetupState): Promise<ActionResult> {
  const loginResponsePromise = ctx.page.waitForResponse(
    (response) => response.url().endsWith("/api/auth/login") && response.request().method() === "POST",
  );

  await ctx.page.getByLabel("Email").fill(TEST_EMAIL);
  await ctx.page.getByLabel("Password", { exact: true }).fill(TEST_PASSWORD);
  await ctx.page.getByRole("button", { name: "Sign In" }).click();

  const loginResponse = await loginResponsePromise;
  return {
    ok: loginResponse.ok(),
    status: loginResponse.status(),
    body: (await loginResponse.json()) as BrowserSession["body"],
  };
}

export async function clean(ctx: TestContext, setupState: SetupState) {
  await ctx.page
    .evaluate(async () => {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    })
    .catch(() => undefined);
  await ctx.context.clearCookies();
  await clearBrowserState(ctx.page);
  await restoreLastLoginAt(setupState.userId, setupState.previousLastLoginAt);
  await revokeIdentitySessions(setupState.identityId).catch(() => undefined);
}

async function setupLoginState(): Promise<SetupState> {
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

async function setupLoginPage(ctx: TestContext) {
  await clearBrowserState(ctx.page);
  await ctx.context.clearCookies();
  await ctx.page.goto("/auth");
  await expect(ctx.page.getByRole("button", { name: "Sign In" })).toBeEnabled();
}
