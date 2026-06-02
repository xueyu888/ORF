import { expect, test, type Route } from "@playwright/test";
import { initialOrfState } from "../../src/data/initialOrfState";
import type { OrfUser, UserRole } from "../../src/types/orf";
import { routeVisualBackgroundMocks } from "../helpers/visualBackgroundMocks";

type OnlineUser = OrfUser & {
  lastOnlineAt?: string | null;
};

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
  await routeVisualBackgroundMocks(page);

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

test("member list shows recent online timestamps from lastOnlineAt", async ({ page }) => {
  const users: OnlineUser[] = [
    {
      ...initialOrfState.users[0],
      lastOnlineAt: "2026-05-19T10:11:00.000",
    },
    {
      ...initialOrfState.users[1],
      lastOnlineAt: null,
    },
  ];

  await page.route("**/api/users", async (route: Route) => {
    await route.fulfill({ json: { users } });
  });

  await page.goto("/system/members");

  await expect(page.getByRole("columnheader", { name: "最近在线" })).toBeVisible();
  await expect(page.getByRole("row", { name: /Alex Chen/ })).toContainText("2026-05-19 10:11");
  await expect(page.getByRole("row", { name: /Mia Zhang/ })).toContainText("未在线");
});

test("member page reports recent online only after real user activity", async ({ page }) => {
  const activityRequests: Array<{ body: string | null; method: string }> = [];
  const reportedAt = "2026-05-19T10:12:00.000";

  await page.route("**/api/users", async (route: Route) => {
    await route.fulfill({ json: { users: initialOrfState.users } });
  });
  await page.route("**/api/users/me/activity", async (route: Route) => {
    activityRequests.push({
      body: route.request().postData(),
      method: route.request().method(),
    });
    await route.fulfill({ json: { ok: true, lastOnlineAt: reportedAt } });
  });

  await page.goto("/system/members");
  await expect(page.getByRole("button", { name: "新增用户" })).toBeVisible();
  await expect.poll(() => activityRequests.length, { timeout: 500 }).toBe(0);

  await page.mouse.click(12, 12);

  await expect.poll(() => activityRequests.length).toBe(1);
  expect(activityRequests[0]?.method).toBe("POST");
  expect(activityRequests[0]?.body ?? "").not.toContain("lastOnlineAt");
  expect(activityRequests[0]?.body ?? "").not.toContain("timestamp");
  await expect(page.getByRole("row", { name: /Alex Chen/ })).toContainText("2026-05-19 10:12");

  await page.mouse.wheel(0, 120);
  await page.keyboard.press("A");
  await page.mouse.click(20, 20);
  await page.waitForTimeout(100);

  expect(activityRequests).toHaveLength(1);
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
	          lastOnlineAt: null,
	        },
      ];
    }

    await route.fulfill({ json: { users } });
  });

  await page.goto("/system/members");
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

test("member dialog locks email for users already bound to a login identity", async ({ page }) => {
  const users: OrfUser[] = [
    initialOrfState.users[0],
    {
      ...initialOrfState.users[1],
      authLinked: true,
    },
  ];

  await page.route("**/api/users", async (route: Route) => {
    await route.fulfill({ json: { users } });
  });

  await page.goto("/system/members");

  await page.getByRole("row", { name: /Mia Zhang/ }).getByRole("button", { name: "编辑" }).click();
  const dialog = page.getByRole("dialog", { name: "编辑用户" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("邮箱")).toBeDisabled();
  await expect(dialog.getByLabel("姓名")).toBeEnabled();
});

test("member dialog preserves edits when backend rejects login email changes", async ({ page }) => {
  let updateRequests = 0;

  await page.route("**/api/users", async (route: Route) => {
    await route.fulfill({ json: { users: initialOrfState.users } });
  });
  await page.route("**/api/users/*", async (route: Route) => {
    if (route.request().method() === "PATCH") {
      updateRequests += 1;
      await route.fulfill({ status: 409, json: { error: "Bound login email cannot be changed" } });
      return;
    }

    await route.fallback();
  });

  await page.goto("/system/members");

  await page.getByRole("row", { name: /Mia Zhang/ }).getByRole("button", { name: "编辑" }).click();
  const dialog = page.getByRole("dialog", { name: "编辑用户" });
  await dialog.getByLabel("邮箱").fill("mia-renamed@orf.local");
  await dialog.getByRole("button", { name: "保存" }).click();

  await expect.poll(() => updateRequests).toBe(1);
  await expect(page.getByText("已绑定登录身份的邮箱不能在成员管理中修改")).toBeVisible();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("邮箱")).toHaveValue("mia-renamed@orf.local");
});

test("member dialog rejects blank required values before writing to API", async ({ page }) => {
  let createRequests = 0;

  await page.route("**/api/users", async (route: Route) => {
    if (route.request().method() === "POST") {
      createRequests += 1;
    }

    await route.fulfill({ json: { users: initialOrfState.users } });
  });

  await page.goto("/system/members");
  await page.getByRole("button", { name: "新增用户" }).click();

  const dialog = page.getByRole("dialog", { name: "新增用户" });
  await dialog.getByLabel("姓名").fill("   ");
  await dialog.getByLabel("邮箱").fill("blank-name@orf.test");
  await dialog.getByRole("button", { name: "新增用户" }).click();

  await expect(dialog).toBeVisible();
  await expect(page.getByText("请填写姓名和邮箱")).toBeVisible();
  await expect.poll(() => createRequests).toBe(0);
});

test("member dialog preserves in-flight user writes until the API responds", async ({ page }) => {
  const createResponse = createDeferred<void>();
  let createRequests = 0;

  await page.route("**/api/users", async (route: Route) => {
    if (route.request().method() === "POST") {
      createRequests += 1;
      await createResponse.promise;
      await route.fulfill({ status: 500, json: { error: "user create unavailable" } });
      return;
    }

    await route.fulfill({ json: { users: initialOrfState.users } });
  });

  await page.goto("/system/members");
  await page.getByRole("button", { name: "新增用户" }).click();

  const dialog = page.getByRole("dialog", { name: "新增用户" });
  await dialog.getByLabel("姓名").fill("Slow Member");
  await dialog.getByLabel("邮箱").fill("slow.member@orf.test");
  await dialog.getByRole("button", { name: "新增用户" }).click();

  await expect.poll(() => createRequests).toBe(1);
  await expect(dialog.getByRole("button", { name: "保存中" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "关闭" })).toBeDisabled();

  await page.locator(".orf-user-dialog-backdrop").click({ position: { x: 8, y: 8 }, force: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("姓名")).toBeDisabled();
  await expect(dialog.getByLabel("邮箱")).toBeDisabled();

  createResponse.resolve();
  await expect(page.getByText("user create unavailable")).toBeVisible();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("姓名")).toHaveValue("Slow Member");
  await expect(dialog.getByLabel("邮箱")).toHaveValue("slow.member@orf.test");
  await expect(dialog.getByRole("button", { name: "新增用户" })).toBeEnabled();
});

test("member page deletes unreferenced users through the user DELETE endpoint", async ({ page }) => {
  const removableUser: OrfUser = {
    ...initialOrfState.users[2]!,
    id: "user-removable-member",
    name: "Removable Member",
    email: "removable.member@orf.test",
    role: "member",
    status: "active",
  };
  let users: OrfUser[] = [initialOrfState.users[0]!, removableUser];
  let deleteRequests = 0;

  page.on("dialog", async (dialog) => {
    expect(dialog.message()).toContain("删除账号");
    await dialog.accept();
  });

  await page.route("**/api/users", async (route: Route) => {
    await route.fulfill({ json: { users } });
  });
  await page.route("**/api/users/*", async (route: Route) => {
    if (route.request().method() === "DELETE") {
      deleteRequests += 1;
      users = users.filter((user) => user.id !== removableUser.id);
      await route.fulfill({ json: { users } });
      return;
    }

    await route.fallback();
  });

  await page.goto("/system/members");

  const removableRow = page.getByRole("row", { name: /Removable Member/ });
  await expect(removableRow.getByRole("button", { name: "删除" })).toBeVisible();
  await removableRow.getByRole("button", { name: "删除" }).click();

  await expect.poll(() => deleteRequests).toBe(1);
  await expect(page.getByRole("row", { name: /Removable Member/ })).toHaveCount(0);
  await expect(page.getByRole("row", { name: /Alex Chen/ }).getByRole("button", { name: "删除" })).toBeDisabled();
});

function createDeferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}
