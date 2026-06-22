import { expect, type Page } from "@playwright/test";
import type { OperatorRegistry } from "../../_framework/types";
import { clearBrowserState } from "../../_operators/common.helpers";
import { requiredString } from "../../_operators/params";
import type { SystemSettingsOverviewCaseData, TestContext } from "./_support/settings-overview.context";
import { setDefaultLandingPathByEmail } from "./_support/settings-overview.helpers";

export const systemSettingsOverviewOperators = {
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
  "page.system_settings_title": {
    visible: async ({ ctx }) => {
      await expect(systemSettingsTitle(ctx.page)).toBeVisible();
    },
  },
  "page.system_settings_detail": {
    visible: async ({ ctx }) => {
      await expect(settingsDetail(ctx.page)).toBeVisible();
    },
  },
  "page.system_settings_description": {
    visible: async ({ ctx }) => {
      await expect(settingsDetail(ctx.page)).toContainText("管理全站视觉、聊天和系统级策略");
    },
  },
  "page.system_settings_page": {
    observe: async ({ ctx }) => {
      await expect(ctx.page).toHaveURL(/\/system\/settings$/);
      await expect(systemSettingsTitle(ctx.page)).toBeVisible();
      await expect(settingsDetail(ctx.page)).toBeVisible();
    },
  },
  "page.system_settings_chat_section": {
    visible: async ({ ctx }) => {
      await expect(settingsSection(ctx.page, "聊天设置")).toBeVisible();
    },
  },
  "page.system_settings_chat_attachment_limit": {
    visible: async ({ ctx }) => {
      const section = settingsSection(ctx.page, "聊天设置");
      await expect(section).toContainText("附件上限");
      await expect(section.locator(".orf-settings-number-input")).toBeVisible();
    },
  },
  "page.system_settings_gitlab_chat_section": {
    visible: async ({ ctx }) => {
      await expect(settingsSection(ctx.page, "GitLab 聊天绑定")).toBeVisible();
    },
  },
  "page.system_settings_skin_module": {
    visible: async ({ ctx }) => {
      await expect(skinWorkbench(ctx.page)).toBeVisible();
      await expect(skinWorkbench(ctx.page)).toContainText("系统默认");
    },
  },
  "page.system_settings_skin_slot": {
    visible: async ({ ctx, params }) => {
      await expect(skinSlot(ctx.page, requiredString(params, "label"))).toBeVisible();
    },
  },
  "page.system_settings_appshell_skin_slot": {
    visible: async ({ ctx }) => {
      await expect(skinSlot(ctx.page, /首页|悬赏大厅|我的挑战|系统管理/)).toBeVisible();
    },
  },
  "page.system_settings_background_list": {
    visible: async ({ ctx }) => {
      const gallery = skinWorkbench(ctx.page).locator(".orf-skin-gallery");
      await expect(gallery).toBeVisible();
      await expect(gallery.locator(".orf-skin-gallery-card, .orf-skin-empty-upload").first()).toBeVisible();
    },
  },
  "page.system_settings_skin_upload": {
    visible: async ({ ctx }) => {
      await expect(skinWorkbench(ctx.page).getByRole("button", { name: "上传" })).toBeVisible();
    },
  },
  "page.system_settings_skin_save": {
    visible: async ({ ctx }) => {
      await expect(skinWorkbench(ctx.page).getByRole("button", { name: "保存" })).toBeVisible();
    },
  },
} satisfies OperatorRegistry<TestContext, SystemSettingsOverviewCaseData>;

function systemSettingsTitle(page: Page) {
  return page.locator(".orf-topbar-title").filter({ hasText: "系统设置" });
}

function settingsDetail(page: Page) {
  return page.locator(".orf-settings-detail").filter({ hasText: "System Config" });
}

function settingsSection(page: Page, title: string) {
  return page.locator(".orf-settings-background-section").filter({ hasText: title });
}

function skinWorkbench(page: Page) {
  return page.locator(".orf-skin-workbench[data-scope='system']");
}

function skinSlot(page: Page, label: string | RegExp) {
  return skinWorkbench(page).locator(".orf-skin-slot-button").filter({ hasText: label }).first();
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
