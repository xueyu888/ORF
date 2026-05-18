import { expect, test } from "@playwright/test";
import { initialOrfState } from "../../src/data/initialOrfState";
import type { VisualBackgroundScene } from "../../src/state/apiClient";

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
});

test("settings page only exposes implemented visual configuration", async ({ page }) => {
  const requestedScenes: VisualBackgroundScene[] = [];

  await page.route("**/api/settings/visual/backgrounds?**", async (route) => {
    const url = new URL(route.request().url());
    const scene = (url.searchParams.get("scene") ?? "login_background") as VisualBackgroundScene;
    requestedScenes.push(scene);

    await route.fulfill({
      json: {
        code: 0,
        message: "ok",
        data: {
          scene,
          config: {
            mode: "fixed",
            fixedBackgroundId: `${scene}/default/test-bg.png`,
            switchTrigger: "on_open",
            switchOrder: "random",
            switchIntervalMinutes: 10,
          },
          list: [
            {
              id: `${scene}/default/test-bg.png`,
              scene,
              fileName: "test-bg.png",
              url: `/settings/backgrounds/${scene}/default/test-bg.png`,
              fileKey: `${scene}/default/test-bg.png`,
              mimeType: "image/png",
              fileSize: 128,
              isDefault: true,
            },
          ],
        },
      },
    });
  });

  await page.route("**/settings/backgrounds/**", async (route) => {
    await route.fulfill({
      contentType: "image/png",
      body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=", "base64"),
    });
  });

  await page.goto("/settings");

  await expect(page.getByRole("heading", { name: "视觉设置" })).toBeVisible();
  await expect(page.getByLabel("设置导航")).toContainText("视觉设置");
  await expect(page.getByText("Coming Soon")).toHaveCount(0);

  for (const hiddenLabel of ["周期与团队", "反馈分类", "ORF 规则", "存储"]) {
    await expect(page.getByText(hiddenLabel, { exact: true })).toHaveCount(0);
  }

  await expect.poll(() => Array.from(new Set(requestedScenes)).sort()).toEqual(["login_background", "sidebar_background"]);
});
