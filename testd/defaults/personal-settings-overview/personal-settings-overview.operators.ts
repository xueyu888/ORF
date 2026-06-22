import { expect, type Locator, type Page } from "@playwright/test";
import type { OperatorRegistry } from "../../_framework/types";
import { clearBrowserState } from "../../_operators/common.helpers";
import { requiredString } from "../../_operators/params";
import type { PersonalSettingsOverviewCaseData, TestContext } from "./_support/personal-settings-overview.context";
import {
  deleteAvatarByEmail,
  setDefaultLandingPathByEmail,
  uploadAvatarByEmail,
} from "./_support/personal-settings-overview.helpers";

export const personalSettingsOverviewOperators = {
  browser: {
    clear_state: async ({ ctx }) => {
      await ctx.context.clearCookies();
      await clearBrowserState(ctx.page);
      await installDesktopShellMock(ctx.page);
    },
  },
  "user.preferences": {
    set_default_landing_path_by_email: async ({ params }) => {
      await setDefaultLandingPathByEmail(requiredString(params, "email"), requiredString(params, "path"));
    },
    reset_default_landing_path_by_email: async ({ params }) => {
      await setDefaultLandingPathByEmail(requiredString(params, "email"), null);
    },
  },
  "user.avatar": {
    upload_by_email: async ({ params }) => {
      await uploadAvatarByEmail(requiredString(params, "email"));
    },
    delete_by_email: async ({ params }) => {
      await deleteAvatarByEmail(requiredString(params, "email"));
    },
  },
  "sidebar.current_user_avatar": {
    visible: async ({ ctx }) => {
      await expect(sidebarUserButton(ctx.page).locator("div[title]").first()).toBeVisible();
    },
  },
  "sidebar.current_user_name": {
    text: async ({ ctx, params }) => {
      await expect(sidebar(ctx.page).locator(".orf-sidebar-user-name")).toHaveText(requiredString(params, "name"));
    },
  },
  "sidebar.user_menu": {
    visible: async ({ ctx }) => {
      await expect(sidebarUserButton(ctx.page)).toBeVisible();
    },
    enabled: async ({ ctx }) => {
      await expect(sidebarUserButton(ctx.page)).toBeEnabled();
    },
    click: async ({ ctx }) => {
      await sidebarUserButton(ctx.page).click();
      await expect(userMenu(ctx.page)).toBeVisible();
    },
  },
  "user_menu.item": {
    hidden: async ({ ctx, params }) => {
      await expect(menuItem(ctx.page, requiredString(params, "name"))).toHaveCount(0);
    },
  },
  "page.user_menu_item": {
    click: async ({ ctx, params }) => {
      await ensureUserMenuOpen(ctx.page);
      await menuItem(ctx.page, requiredString(params, "name")).click();
      await expect(ctx.page).toHaveURL(/\/settings$/);
      await expect(ctx.page.getByRole("heading", { name: "个人设置", exact: true })).toBeVisible();
    },
  },
  "personal_settings.page": {
    visible: async ({ ctx, params }) => {
      await expect(ctx.page).toHaveURL(new RegExp(requiredString(params, "pattern")));
      await expect(ctx.page.getByRole("heading", { name: "个人设置", exact: true })).toBeVisible();
    },
  },
  "personal_settings.title": {
    text: async ({ ctx, params }) => {
      await expect(ctx.page.getByRole("heading", { name: requiredString(params, "value"), exact: true })).toBeVisible();
    },
  },
  "personal_settings.subtitle": {
    text: async ({ ctx, params }) => {
      await expect(ctx.page.getByText(requiredString(params, "value"), { exact: true })).toBeVisible();
    },
  },
  "personal_settings.current_user_avatar": {
    visible: async ({ ctx }) => {
      await expect(currentUserCard(ctx.page).locator(".orf-avatar-preview-trigger")).toBeVisible();
    },
  },
  "personal_settings.current_user_name": {
    text: async ({ ctx, params }) => {
      await expect(currentUserCard(ctx.page)).toContainText(requiredString(params, "value"));
    },
  },
  "personal_settings.current_user_email": {
    text: async ({ ctx, params }) => {
      await expect(currentUserCard(ctx.page)).toContainText(requiredString(params, "value"));
    },
  },
  "personal_settings.current_user_role": {
    text: async ({ ctx, params }) => {
      await expect(settingsInfoValue(ctx.page, "角色")).toHaveText(requiredString(params, "value"));
    },
  },
  "personal_settings.current_user_status": {
    text: async ({ ctx, params }) => {
      await expect(settingsInfoValue(ctx.page, "状态")).toHaveText(requiredString(params, "value"));
    },
  },
  "personal_settings.upload_avatar": {
    visible: async ({ ctx }) => {
      await expect(uploadAvatarButton(ctx.page)).toBeVisible();
    },
    enabled: async ({ ctx }) => {
      await expect(uploadAvatarButton(ctx.page)).toBeEnabled();
    },
  },
  "personal_settings.delete_avatar": {
    visible: async ({ ctx }) => {
      await expect(deleteAvatarButton(ctx.page)).toBeVisible();
    },
    enabled: async ({ ctx }) => {
      await expect(deleteAvatarButton(ctx.page)).toBeEnabled();
    },
  },
  "personal_settings.default_landing": {
    visible: async ({ ctx }) => {
      await expect(settingsSelect(ctx.page, "默认进入页面")).toBeVisible();
    },
    enabled: async ({ ctx }) => {
      await expect(settingsSelect(ctx.page, "默认进入页面")).toBeEnabled();
    },
  },
  "personal_settings.sidebar_state": {
    visible: async ({ ctx }) => {
      await expect(settingsSelect(ctx.page, "侧边栏默认状态")).toBeVisible();
    },
    enabled: async ({ ctx }) => {
      await expect(settingsSelect(ctx.page, "侧边栏默认状态")).toBeEnabled();
    },
  },
  "personal_settings.toast": {
    visible: async ({ ctx }) => {
      await expect(settingsBlock(ctx.page, "Toast 通知")).toBeVisible();
    },
    enabled: async ({ ctx }) => {
      await expect(settingsBlock(ctx.page, "Toast 通知").locator('input[type="checkbox"]')).toBeEnabled();
    },
  },
} satisfies OperatorRegistry<TestContext, PersonalSettingsOverviewCaseData>;

function sidebar(page: Page) {
  return page.locator("aside.orf-sidebar[aria-label='主导航']");
}

function sidebarUserButton(page: Page) {
  return sidebar(page).getByRole("button", { name: "用户菜单", exact: true });
}

function userMenu(page: Page) {
  return page.getByRole("menu", { name: "用户菜单" });
}

function menuItem(page: Page, name: string) {
  return page.getByRole("menuitem", { name, exact: true });
}

async function ensureUserMenuOpen(page: Page) {
  if (!(await userMenu(page).isVisible().catch(() => false))) {
    await sidebarUserButton(page).click();
  }
  await expect(userMenu(page)).toBeVisible();
}

function currentUserCard(page: Page) {
  return page.locator(".orf-card-padding").filter({ has: page.getByRole("button", { name: "上传头像" }) }).first();
}

function settingsInfoValue(page: Page, label: string) {
  return currentUserCard(page)
    .locator(".mt-4.grid > div")
    .filter({ hasText: label })
    .locator(".font-medium.orf-text-primary");
}

function uploadAvatarButton(page: Page) {
  return currentUserCard(page).getByRole("button", { name: "上传头像" });
}

function deleteAvatarButton(page: Page) {
  return currentUserCard(page).getByRole("button", { name: "删除" });
}

function settingsBlock(page: Page, label: string) {
  return page.locator("label").filter({ hasText: label }).first();
}

function settingsSelect(page: Page, label: string) {
  return settingsBlock(page, label).locator("select");
}

async function installDesktopShellMock(page: Page) {
  await page.addInitScript(() => {
    const maximizedState = {
      isFocused: true,
      isFullScreen: false,
      isMaximized: true,
      isMinimized: false,
      isVisible: true,
    };
    window.orfDesktopShell = {
      closeWindow: async () => ({ data: maximizedState, status: "success" }),
      getWindowState: async () => ({ data: maximizedState, status: "success" }),
      minimizeWindow: async () => ({ data: { ...maximizedState, isMinimized: true }, status: "success" }),
      onWindowStateChange: () => () => undefined,
      setWorkbenchZoomLevel: async ({ level }) => ({ data: { level }, status: "success" }),
      toggleMaximizeWindow: async () => ({ data: maximizedState, status: "success" }),
    };
  });
}
