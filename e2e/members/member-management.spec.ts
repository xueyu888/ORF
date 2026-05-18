import { expect, test, type Route } from "@playwright/test";
import { initialOrfState } from "../../src/data/initialOrfState";
import type { OrfUser, UserRole } from "../../src/types/orf";

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
});

test("member dialog trims identity fields before creating users", async ({ page }) => {
  let submittedBody: { name: string; email: string; role: UserRole } | null = null;
  let users: OrfUser[] = [...initialOrfState.users];

  await page.route("**/api/users", async (route: Route) => {
    if (route.request().method() === "POST") {
      submittedBody = route.request().postDataJSON() as { name: string; email: string; role: UserRole };
      users = [
        ...users,
        {
          id: "user-trimmed-member",
          name: submittedBody.name,
          email: submittedBody.email,
          role: submittedBody.role,
          status: "active",
          lastLoginAt: null,
        },
      ];
    }

    await route.fulfill({ json: { users } });
  });

  await page.goto("/members");
  await page.getByRole("button", { name: "新增用户" }).click();

  const dialog = page.getByRole("dialog", { name: "新增用户" });
  await expect(dialog).toBeVisible();

  await dialog.getByLabel("姓名").fill("  Trimmed Member  ");
  await dialog.getByLabel("邮箱").fill("  TRIMMED.Member@ORF.TEST  ");
  await dialog.getByRole("button", { name: "新增用户" }).click();

  await expect.poll(() => submittedBody).toEqual({
    name: "Trimmed Member",
    email: "trimmed.member@orf.test",
    role: "member",
  });
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText("Trimmed Member")).toBeVisible();
});

test("member dialog rejects blank required values before writing to API", async ({ page }) => {
  let createRequests = 0;

  await page.route("**/api/users", async (route: Route) => {
    if (route.request().method() === "POST") {
      createRequests += 1;
    }

    await route.fulfill({ json: { users: initialOrfState.users } });
  });

  await page.goto("/members");
  await page.getByRole("button", { name: "新增用户" }).click();

  const dialog = page.getByRole("dialog", { name: "新增用户" });
  await dialog.getByLabel("姓名").fill("   ");
  await dialog.getByLabel("邮箱").fill("blank-name@orf.test");
  await dialog.getByRole("button", { name: "新增用户" }).click();

  await expect(dialog).toBeVisible();
  await expect(page.getByText("请填写姓名和邮箱")).toBeVisible();
  await expect.poll(() => createRequests).toBe(0);
});
