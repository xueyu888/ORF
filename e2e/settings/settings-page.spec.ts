import { expect, test } from "@playwright/test";
import { initialOrfState } from "../../src/data/initialOrfState";
import type { VisualBackgroundScene } from "../../src/state/apiClient";
import { fulfillVisualBackgroundImage, personalBackgroundFixture, visualBackgroundFixture } from "../helpers/visualBackgroundMocks";

function taskManagementData() {
  return {
    objectives: initialOrfState.objectives,
    results: initialOrfState.results,
    tasks: initialOrfState.tasks,
    evidence: initialOrfState.evidence,
    feedback: initialOrfState.feedback,
    comments: initialOrfState.comments,
    permissionRules: initialOrfState.permissionRules,
  };
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear());

  await page.route("**/api/auth/session", async (route) => {
    await route.fulfill({ json: { authenticated: true, user: initialOrfState.users[0] } });
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
  await page.route("**/api/settings/personal/preferences", async (route) => {
    await route.fulfill({ json: { code: 0, message: "ok", data: personalBackgroundFixture().preferences } });
  });
});

test("settings page only exposes implemented visual configuration", async ({ page }) => {
  const requestedScenes: VisualBackgroundScene[] = [];
  let requestedPersonalBackgrounds = false;

  await page.route("**/api/settings/personal/backgrounds", async (route) => {
    requestedPersonalBackgrounds = true;
    await route.fulfill({ json: { code: 0, message: "ok", data: personalBackgroundFixture() } });
  });

  await page.route("**/api/settings/visual/backgrounds?**", async (route) => {
    const url = new URL(route.request().url());
    const scene = (url.searchParams.get("scene") ?? "login_background") as VisualBackgroundScene;
    requestedScenes.push(scene);

    await route.fulfill({ json: { code: 0, message: "ok", data: visualBackgroundFixture(scene) } });
  });

  await page.route("**/settings/backgrounds/**", fulfillVisualBackgroundImage);

  await page.goto("/system/settings");

  await expect(page.getByRole("heading", { name: "视觉设置" })).toBeVisible();
  await expect(page.locator(".orf-sidebar-background-image")).toHaveAttribute("src", /\/settings\/backgrounds\/app_background\/default\/test-bg\.png$/);
  await expect.poll(() =>
    page.locator(".orf-sidebar-background-image").evaluate((image) => {
      const element = image as HTMLImageElement;
      return { complete: element.complete, naturalWidth: element.naturalWidth };
    }),
  ).toEqual({ complete: true, naturalWidth: 1 });
  await expect.poll(() =>
    page.locator(".orf-topbar").evaluate((topbar) => window.getComputedStyle(topbar).backgroundImage),
  ).toContain("/settings/backgrounds/app_background/default/test-bg.png");
  await expect.poll(() =>
    page.locator(".orf-topbar-title").evaluate((title) => window.getComputedStyle(title).color),
  ).toBe("rgb(255, 248, 232)");
  await expect.poll(() =>
    page.locator(".orf-main-content").evaluate((mainContent) => window.getComputedStyle(mainContent).backgroundImage),
  ).toBe("none");
  await expect(page.getByLabel("系统管理导航")).toContainText("系统设置");
  await expect(page.getByText("Coming Soon")).toHaveCount(0);

  for (const hiddenLabel of ["周期与团队", "反馈分类", "ORF 规则", "存储"]) {
    await expect(page.getByText(hiddenLabel, { exact: true })).toHaveCount(0);
  }

  await expect.poll(() => requestedPersonalBackgrounds).toBe(true);
  await expect.poll(() => Array.from(new Set(requestedScenes)).sort()).toEqual(["app_background", "login_background"]);
});

test("sidebar background image load failure is reported instead of falling back to a color", async ({ page }) => {
  await page.route("**/api/settings/personal/backgrounds", async (route) => {
    await route.fulfill({ json: { code: 0, message: "ok", data: personalBackgroundFixture() } });
  });

  await page.route("**/api/settings/visual/backgrounds?**", async (route) => {
    const url = new URL(route.request().url());
    const scene = (url.searchParams.get("scene") ?? "login_background") as VisualBackgroundScene;
    await route.fulfill({ json: { code: 0, message: "ok", data: visualBackgroundFixture(scene) } });
  });

  await page.route("**/settings/backgrounds/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.includes("/app_background/")) {
      await route.fulfill({ status: 404, body: "" });
      return;
    }

    await fulfillVisualBackgroundImage(route);
  });

  const pageError = page.waitForEvent("pageerror");
  await page.goto("/system/settings");
  const error = await pageError;
  expect(error.message).toContain("Sidebar background image failed to load");
});
