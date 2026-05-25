import { expect, test, type Route } from "@playwright/test";
import { initialOrfState } from "../../src/data/initialOrfState";
import type { AppNotification } from "../../src/types/orf";
import { routeVisualBackgroundMocks } from "../helpers/visualBackgroundMocks";

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

function unreadCount(notifications: AppNotification[]) {
  return notifications.filter((notification) => !notification.readAt).length;
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
  await page.route("**/api/users", async (route) => {
    await route.fulfill({ json: { users: initialOrfState.users } });
  });
  await page.route("**/api/users/me/activity", async (route) => {
    await route.fulfill({ json: { ok: true, lastOnlineAt: null } });
  });
});

test("topbar notification entry is visible across authenticated pages", async ({ page }) => {
  await page.route(/\/api\/notifications(?:\/.*)?$/, async (route: Route) => {
    await route.fulfill({ json: { notifications: [], unreadCount: 0 } });
  });

  for (const path of ["/bounties", "/tasks", "/feedback", "/reports", "/members", "/permissions", "/settings"]) {
    await page.goto(path);
    await expect(page.getByRole("button", { name: "消息" })).toBeVisible();
  }
});

test("topbar notification bell shows unread messages and marks the opened message read", async ({ page }) => {
  const now = new Date().toISOString();
  const readNotifications: string[] = [];
  const applicationObjective = initialOrfState.objectives.find((objective) => objective.id === "obj-bounty-agent-retry");
  if (!applicationObjective) {
    throw new Error("Missing notification objective fixture");
  }
  let notifications: AppNotification[] = [
    {
      id: "notification-application",
      kind: "challenge.application.created",
      recipientUserId: initialOrfState.users[0].id,
      actorUserId: initialOrfState.users[1].id,
      actorName: initialOrfState.users[1].name,
      title: "新的挑战申请",
      body: `Mia Zhang 申请挑战「${applicationObjective.title}」，需要指挥官确认。`,
      targetType: "objective",
      targetId: applicationObjective.id,
      targetHref: "/tasks",
      readAt: null,
      createdAt: now,
      metadata: { objectiveTitle: applicationObjective.title },
    },
    {
      id: "notification-loot",
      kind: "objective.loot.submitted",
      recipientUserId: initialOrfState.users[0].id,
      actorUserId: initialOrfState.users[2].id,
      actorName: initialOrfState.users[2].name,
      title: "战利品待验收",
      body: "Ethan Liu 已提交「指标验收」的目标战利品，需要指挥官验收。",
      targetType: "objectiveLoot",
      targetId: "loot-notification-1",
      targetHref: "/objectives/objective-notification-1/loot",
      readAt: null,
      createdAt: now,
      metadata: { objectiveTitle: "指标验收" },
    },
  ];

  await page.route(/\/api\/notifications(?:\/.*)?$/, async (route: Route) => {
    const url = new URL(route.request().url());

    if (route.request().method() === "GET" && url.pathname === "/api/notifications") {
      await route.fulfill({ json: { notifications, unreadCount: unreadCount(notifications) } });
      return;
    }

    const readMatch = url.pathname.match(/^\/api\/notifications\/(.+)\/read$/);
    if (route.request().method() === "PATCH" && readMatch) {
      const notificationId = decodeURIComponent(readMatch[1] ?? "");
      readNotifications.push(notificationId);
      notifications = notifications.map((notification) => (notification.id === notificationId ? { ...notification, readAt: now } : notification));
      const notification = notifications.find((item) => item.id === notificationId);
      await route.fulfill({ json: { notification, unreadCount: unreadCount(notifications) } });
      return;
    }

    await route.fulfill({ status: 404, json: { error: "Notification route not modeled" } });
  });

  await page.goto("/tasks");

  const bell = page.getByRole("button", { name: /消息，2 条未读/ });
  await expect(bell).toBeVisible();
  await expect(page.getByRole("navigation", { name: "主导航" }).getByText("消息")).toHaveCount(0);

  await bell.click();
  const popover = page.locator(".orf-notification-popover");
  await expect(popover).toHaveCSS("position", "absolute");
  const popoverBox = await popover.boundingBox();
  const viewport = page.viewportSize();
  expect(popoverBox).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(popoverBox!.x).toBeGreaterThanOrEqual(0);
  expect(popoverBox!.x + popoverBox!.width).toBeLessThanOrEqual(viewport!.width);
  const applicationPreview = page.getByRole("button", { name: /新的挑战申请/ });
  await expect(applicationPreview).toBeVisible();
  await expect(applicationPreview).toHaveCSS("border-radius", "8px");
  await expect(applicationPreview.locator(".orf-notification-preview-title")).toHaveCSS("color", "rgb(23, 32, 51)");
  await expect(applicationPreview.locator(".orf-notification-preview-body")).toHaveCSS("color", "rgb(67, 83, 108)");
  const footerAction = page.getByRole("button", { name: /查看全部消息/ });
  await expect(footerAction).toHaveCSS("border-top-left-radius", "0px");
  await expect(footerAction).toHaveCSS("border-bottom-left-radius", "10px");
  await expect(page.getByRole("button", { name: /战利品待验收/ })).toBeVisible();

  await page.getByRole("button", { name: /新的挑战申请/ }).click();

  await expect.poll(() => readNotifications).toContain("notification-application");
  await expect(page).toHaveURL(new RegExp(`/tasks#objective:${applicationObjective.id}$`));
  await expect(page.locator(".orf-objective-header.orf-row-active").filter({ hasText: applicationObjective.title })).toBeVisible();
  await expect(page.getByRole("button", { name: /消息，1 条未读/ })).toBeVisible();
});

test("notification page lists messages and marks all current user messages read", async ({ page }) => {
  const now = new Date().toISOString();
  let readAllRequests = 0;
  let notifications: AppNotification[] = [
    {
      id: "notification-application",
      kind: "challenge.application.created",
      recipientUserId: initialOrfState.users[0].id,
      actorUserId: initialOrfState.users[1].id,
      actorName: initialOrfState.users[1].name,
      title: "新的挑战申请",
      body: "Mia Zhang 申请挑战「提升任务流」，需要指挥官确认。",
      targetType: "objective",
      targetId: "objective-notification-1",
      targetHref: "/tasks#objective:objective-notification-1",
      readAt: null,
      createdAt: now,
      metadata: { objectiveTitle: "提升任务流" },
    },
  ];

  await page.route(/\/api\/notifications(?:\/.*)?$/, async (route: Route) => {
    const url = new URL(route.request().url());

    if (route.request().method() === "GET" && url.pathname === "/api/notifications") {
      await route.fulfill({ json: { notifications, unreadCount: unreadCount(notifications) } });
      return;
    }

    if (route.request().method() === "PATCH" && url.pathname === "/api/notifications/read-all") {
      readAllRequests += 1;
      notifications = notifications.map((notification) => ({ ...notification, readAt: notification.readAt ?? now }));
      await route.fulfill({ json: { updated: notifications.length, unreadCount: 0 } });
      return;
    }

    await route.fulfill({ status: 404, json: { error: "Notification route not modeled" } });
  });

  await page.goto("/notifications");

  await expect(page.getByRole("heading", { name: "消息" })).toBeVisible();
  await expect(page.getByRole("button", { name: /新的挑战申请/ })).toBeVisible();
  await expect(page.locator(".orf-status-tag", { hasText: "未读" })).toBeVisible();

  await page.getByRole("button", { name: "全部已读" }).click();

  await expect.poll(() => readAllRequests).toBe(1);
  await expect(page.getByRole("button", { name: "全部已读" })).toBeDisabled();
  await expect(page.locator(".orf-status-tag", { hasText: "未读" })).toHaveCount(0);
});
