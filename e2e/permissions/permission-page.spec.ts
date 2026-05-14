import { expect, test, type Route } from "@playwright/test";
import { permissionDefinitions } from "../../src/config/permissions";
import { initialOrfState } from "../../src/data/initialOrfState";
import type { PermissionRule } from "../../src/types/orf";

const emptyMemberRules: PermissionRule[] = [{ role: "member", permissions: [] }];

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
        permissionRules: emptyMemberRules,
        automaticCompletions: initialOrfState.automaticCompletions,
      },
    });
  });
  await page.route("**/api/users", async (route) => {
    await route.fulfill({ json: { users: initialOrfState.users } });
  });
});

test("renders the documented permission list and saves member changes", async ({ page }) => {
  let savedRules: PermissionRule[] | null = null;

  const handlePermissionsRoute = async (route: Route) => {
    if (route.request().method() === "PUT") {
      const body = route.request().postDataJSON() as { permissionRules: PermissionRule[] };
      savedRules = body.permissionRules;
      await route.fulfill({ json: { permissionRules: body.permissionRules } });
      return;
    }

    await route.fulfill({ json: { permissionRules: emptyMemberRules } });
  };
  await page.route("**/api/permissions", handlePermissionsRoute);
  await page.route("**/api/permissions/*", handlePermissionsRoute);

  await page.goto("/permissions");
  await expect(page.getByRole("button", { name: /保存角色权限/ })).toBeDisabled();

  for (const permission of permissionDefinitions) {
    await expect(page.getByRole("cell", { name: permission.key, exact: true })).toBeVisible();
  }

  await page.getByLabel("成员 新建目标").check();
  await expect(page.getByRole("button", { name: /保存角色权限/ })).toBeEnabled();
  await page.getByRole("button", { name: /保存角色权限/ }).click();

  await expect.poll(() => savedRules).toEqual([{ role: "member", permissions: ["objective.create"] }]);
  await expect(page.getByRole("button", { name: /保存角色权限/ })).toBeDisabled();
});

test("keeps admin permissions fixed and read-only", async ({ page }) => {
  await page.route("**/api/permissions", async (route) => {
    await route.fulfill({ json: { permissionRules: emptyMemberRules } });
  });

  await page.goto("/permissions");
  await page.getByRole("button", { name: /管理员/ }).click();

  await expect(page.getByRole("button", { name: /保存角色权限/ })).toBeDisabled();

  for (const permission of permissionDefinitions) {
    const checkbox = page.getByLabel(`管理员 ${permission.label}`);
    await expect(checkbox).toBeChecked();
    await expect(checkbox).toBeDisabled();
  }
});
