import { expect, test } from "@playwright/test";
import { initialOrfState } from "../../src/data/initialOrfState";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear());

  await page.route("**/api/auth/session", async (route) => {
    await route.fulfill({ json: { authenticated: true, user: initialOrfState.users[0] } });
  });
  await page.route("**/api/tasks-page", async (route) => {
    await route.fulfill({
      json: {
        objectives: initialOrfState.objectives,
        results: initialOrfState.results,
        tasks: initialOrfState.tasks,
        evidence: initialOrfState.evidence,
        feedback: initialOrfState.feedback,
        comments: initialOrfState.comments,
        permissionRules: initialOrfState.permissionRules,
        automaticCompletions: initialOrfState.automaticCompletions,
      },
    });
  });
  await page.route("**/api/permissions", async (route) => {
    await route.fulfill({ json: { permissionRules: initialOrfState.permissionRules } });
  });
  await page.route("**/api/users", async (route) => {
    await route.fulfill({ json: { users: initialOrfState.users } });
  });
});

test("renders the bounty hall through the swappable skin and opens the light detail", async ({ page }) => {
  await page.goto("/bounties");

  await expect(page.getByRole("heading", { name: "悬赏大厅" })).toBeVisible();
  await expect(page.locator(".bounty-hall-page")).toBeVisible();
  await expect(page.locator(".bounty-action").first()).toBeVisible();

  await page.getByLabel("搜索悬赏指标").fill("缓存");
  await expect(page.getByText("当前可申请 1 条")).toBeVisible();
  await expect(page.getByRole("heading", { name: "缓存命中率达到 40%" })).toBeVisible();

  await page.getByRole("button", { name: "查看口径" }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByText("悬赏口径")).toBeVisible();

  await page.getByRole("button", { name: "关闭" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
