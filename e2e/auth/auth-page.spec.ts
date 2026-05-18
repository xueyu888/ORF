import { expect, test } from "@playwright/test";
import { initialOrfState } from "../../src/data/initialOrfState";

function taskManagementData() {
  return {
    objectives: [],
    results: [],
    tasks: [],
    evidence: [],
    feedback: [],
    comments: [],
    permissionRules: initialOrfState.permissionRules,
  };
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear());

  await page.route("**/api/auth/session", async (route) => {
    await route.fulfill({ json: { authenticated: false, user: null } });
  });
  await page.route("**/api/settings/visual/backgrounds?**", async (route) => {
    await route.fulfill({
      json: {
        code: 0,
        message: "ok",
        data: {
          scene: "login_background",
          config: { mode: "fixed", fixedBackgroundId: null, switchTrigger: "on_open", switchOrder: "random", switchIntervalMinutes: 10 },
          list: [],
        },
      },
    });
  });
  await page.route("**/api/tasks-page", async (route) => {
    await route.fulfill({ json: taskManagementData() });
  });
  await page.route("**/api/permissions", async (route) => {
    await route.fulfill({ json: { permissionRules: initialOrfState.permissionRules } });
  });
  await page.route("**/api/users", async (route) => {
    await route.fulfill({ json: { users: initialOrfState.users } });
  });
});

test("login trims and normalizes email before posting credentials", async ({ page }) => {
  let loginPayload: { email: string; password: string } | null = null;

  await page.route("**/api/auth/login", async (route) => {
    loginPayload = route.request().postDataJSON() as { email: string; password: string };
    await route.fulfill({ json: { authenticated: true, user: initialOrfState.users[0] } });
  });

  await page.goto("/auth");
  await page.getByPlaceholder("Email").fill("  ALEX@ORF.LOCAL  ");
  await page.getByPlaceholder("Password").fill("password");
  await page.getByRole("button", { name: "Sign In" }).click();

  await expect.poll(() => loginPayload).toEqual({ email: "alex@orf.local", password: "password" });
});

test("registration trims display name and normalizes email before posting credentials", async ({ page }) => {
  let registrationPayload: { email: string; name: string; password: string } | null = null;

  await page.route("**/api/auth/registration", async (route) => {
    registrationPayload = route.request().postDataJSON() as { email: string; name: string; password: string };
    await route.fulfill({ json: { authenticated: true, user: initialOrfState.users[0] } });
  });

  await page.goto("/auth");
  await page.getByRole("button", { name: "Register" }).click();
  await page.getByPlaceholder("Name").fill("  Trimmed Login User  ");
  await page.getByPlaceholder("Email").fill("  TRIMMED.LOGIN@ORF.TEST  ");
  await page.getByPlaceholder("Password").fill("password123");
  await page.getByRole("button", { name: "Create Account" }).click();

  await expect.poll(() => registrationPayload).toEqual({
    email: "trimmed.login@orf.test",
    name: "Trimmed Login User",
    password: "password123",
  });
});
