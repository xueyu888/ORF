import { expect, type Page } from "@playwright/test";
import type { OperatorRegistry } from "../../_framework/types";
import { clearBrowserState } from "../../_operators/common.helpers";
import { requiredString } from "../../_operators/params";
import type { PersonalSettingsSavePersistenceCaseData, TestContext } from "./_support/personal-settings-save-persistence.context";
import {
  readSavedPreferencesByEmail,
  setChatThemeByEmail,
  setDefaultLandingPathByEmail,
  setSidebarStateByEmail,
  setToastEnabledByEmail,
  type ChatThemePreference,
  type SavedPreferences,
  type SidebarPreferenceState,
} from "./_support/personal-settings-save-persistence.helpers";

type SettingsSnapshot = {
  chatThemeValue: ChatThemePreference;
  defaultLandingValue: string;
  pageUrl: string;
  savedPreferences: SavedPreferences | null;
  sidebarStateValue: SidebarPreferenceState;
  toastEnabled: boolean;
};

export const personalSettingsSavePersistenceOperators = {
  browser: {
    clear_state: async ({ ctx }) => {
      await ctx.context.clearCookies();
      await clearBrowserState(ctx.page);
      await installClientBridgeMocks(ctx.page);
    },
  },
  "user.preferences": {
    set_default_landing_path_by_email: async ({ params }) => {
      const path = params.path === null ? null : requiredString(params, "path");
      await setDefaultLandingPathByEmail(requiredString(params, "email"), path);
    },
    set_sidebar_state_by_email: async ({ params }) => {
      await setSidebarStateByEmail(requiredString(params, "email"), requiredSidebarState(params, "state"));
    },
    set_chat_theme_by_email: async ({ params }) => {
      await setChatThemeByEmail(requiredString(params, "email"), requiredChatTheme(params, "theme"));
    },
    set_toast_enabled_by_email: async ({ params }) => {
      await setToastEnabledByEmail(requiredString(params, "email"), requiredBoolean(params, "enabled"));
    },
    default_landing_is: async ({ params }) => {
      const expected = params.path === null ? null : requiredString(params, "path");
      await expect.poll(() => readSavedPreferencesByEmail(requiredString(params, "email")).then((value) => value?.defaultLandingPath ?? null)).toBe(expected);
    },
    sidebar_state_is: async ({ params }) => {
      await expect.poll(() => readSavedPreferencesByEmail(requiredString(params, "email")).then((value) => value?.sidebarState)).toBe(requiredSidebarState(params, "state"));
    },
    chat_theme_is: async ({ params }) => {
      await expect.poll(() => readSavedPreferencesByEmail(requiredString(params, "email")).then((value) => value?.chatTheme)).toBe(requiredChatTheme(params, "theme"));
    },
    toast_enabled_is: async ({ params }) => {
      await expect.poll(() => readSavedPreferencesByEmail(requiredString(params, "email")).then((value) => value?.toastEnabled)).toBe(requiredBoolean(params, "enabled"));
    },
  },
  "personal_settings.page": {
    visible: async ({ ctx, params }) => {
      await expect(ctx.page).toHaveURL(new RegExp(requiredString(params, "pattern")));
      await expect(ctx.page.getByRole("heading", { name: "个人设置", exact: true })).toBeVisible();
    },
    reload: async ({ ctx, params }) => {
      const email = requiredString(params, "email");
      await ctx.page.reload();
      await expect(ctx.page.getByRole("heading", { name: "个人设置", exact: true })).toBeVisible();
      return captureSettingsSnapshot(ctx.page, email);
    },
  },
  "personal_settings.default_landing": {
    selected: async ({ ctx, params }) => {
      await expect(settingsSelect(ctx.page, "默认进入页面")).toHaveValue(valueForDefaultLandingLabel(requiredString(params, "label")));
    },
    select: async ({ ctx, params }) => {
      const email = requiredString(params, "email");
      const label = requiredString(params, "label");
      const expectedPath = defaultLandingPathForLabel(label);
      await settingsSelect(ctx.page, "默认进入页面").selectOption({ label });
      await expect(settingsSelect(ctx.page, "默认进入页面")).toHaveValue(valueForDefaultLandingLabel(label));
      await expect.poll(() => readSavedPreferencesByEmail(email).then((value) => value?.defaultLandingPath ?? null)).toBe(expectedPath);
      return captureSettingsSnapshot(ctx.page, email);
    },
  },
  "personal_settings.sidebar_state": {
    selected: async ({ ctx, params }) => {
      await expect(settingsSelect(ctx.page, "侧边栏默认状态")).toHaveValue(valueForSidebarLabel(requiredString(params, "label")));
    },
    select: async ({ ctx, params }) => {
      const email = requiredString(params, "email");
      const label = requiredString(params, "label");
      const expectedState = valueForSidebarLabel(label);
      await settingsSelect(ctx.page, "侧边栏默认状态").selectOption({ label });
      await expect(settingsSelect(ctx.page, "侧边栏默认状态")).toHaveValue(expectedState);
      await expect.poll(() => readSavedPreferencesByEmail(email).then((value) => value?.sidebarState)).toBe(expectedState);
      return captureSettingsSnapshot(ctx.page, email);
    },
  },
  "personal_settings.chat_theme": {
    selected: async ({ ctx, params }) => {
      await expect(settingsSelect(ctx.page, "聊天界面主题")).toHaveValue(valueForChatThemeLabel(requiredString(params, "label")));
    },
    select: async ({ ctx, params }) => {
      const email = requiredString(params, "email");
      const label = requiredString(params, "label");
      const expectedTheme = valueForChatThemeLabel(label);
      await settingsSelect(ctx.page, "聊天界面主题").selectOption({ label });
      await expect(settingsSelect(ctx.page, "聊天界面主题")).toHaveValue(expectedTheme);
      await expect.poll(() => readSavedPreferencesByEmail(email).then((value) => value?.chatTheme)).toBe(expectedTheme);
      return captureSettingsSnapshot(ctx.page, email);
    },
  },
  "personal_settings.toast": {
    checked: async ({ ctx, params }) => {
      await expect(toastToggle(ctx.page)).toBeChecked({ checked: requiredBoolean(params, "enabled") });
    },
    set_checked: async ({ ctx, params }) => {
      const email = requiredString(params, "email");
      const enabled = requiredBoolean(params, "enabled");
      if ((await toastToggle(ctx.page).isChecked()) !== enabled) {
        await toastToggle(ctx.page).click();
      }
      await expect(toastToggle(ctx.page)).toBeChecked({ checked: enabled });
      await expect.poll(() => readSavedPreferencesByEmail(email).then((value) => value?.toastEnabled)).toBe(enabled);
      return captureSettingsSnapshot(ctx.page, email);
    },
  },
  settings_snapshot: {
    default_landing: async ({ params }) => {
      expect(requiredSettingsSnapshot(params, "snapshot").defaultLandingValue).toBe(valueForDefaultLandingLabel(requiredString(params, "label")));
    },
    sidebar_state: async ({ params }) => {
      expect(requiredSettingsSnapshot(params, "snapshot").sidebarStateValue).toBe(valueForSidebarLabel(requiredString(params, "label")));
    },
    chat_theme: async ({ params }) => {
      expect(requiredSettingsSnapshot(params, "snapshot").chatThemeValue).toBe(valueForChatThemeLabel(requiredString(params, "label")));
    },
    toast_checked: async ({ params }) => {
      expect(requiredSettingsSnapshot(params, "snapshot").toastEnabled).toBe(requiredBoolean(params, "enabled"));
    },
    saved_default_landing: async ({ params }) => {
      const expected = params.path === null ? null : requiredString(params, "path");
      expect(requiredSettingsSnapshot(params, "snapshot").savedPreferences?.defaultLandingPath ?? null).toBe(expected);
    },
    saved_sidebar_state: async ({ params }) => {
      expect(requiredSettingsSnapshot(params, "snapshot").savedPreferences?.sidebarState).toBe(requiredSidebarState(params, "state"));
    },
    saved_chat_theme: async ({ params }) => {
      expect(requiredSettingsSnapshot(params, "snapshot").savedPreferences?.chatTheme).toBe(requiredChatTheme(params, "theme"));
    },
    saved_toast_enabled: async ({ params }) => {
      expect(requiredSettingsSnapshot(params, "snapshot").savedPreferences?.toastEnabled).toBe(requiredBoolean(params, "enabled"));
    },
  },
} satisfies OperatorRegistry<TestContext, PersonalSettingsSavePersistenceCaseData>;

async function captureSettingsSnapshot(page: Page, email: string): Promise<SettingsSnapshot> {
  await expect(page.getByRole("heading", { name: "个人设置", exact: true })).toBeVisible();
  return {
    chatThemeValue: requiredChatThemeValue(await settingsSelect(page, "聊天界面主题").inputValue()),
    defaultLandingValue: await settingsSelect(page, "默认进入页面").inputValue(),
    pageUrl: page.url(),
    savedPreferences: await readSavedPreferencesByEmail(email),
    sidebarStateValue: requiredSidebarValue(await settingsSelect(page, "侧边栏默认状态").inputValue()),
    toastEnabled: await toastToggle(page).isChecked(),
  };
}

function settingsBlock(page: Page, label: string) {
  return page.locator("label").filter({ hasText: label }).first();
}

function settingsSelect(page: Page, label: string) {
  return settingsBlock(page, label).locator("select");
}

function toastSetting(page: Page) {
  return page.locator("label").filter({ hasText: "Toast 通知" }).first();
}

function toastToggle(page: Page) {
  return toastSetting(page).locator('input[type="checkbox"]');
}

function valueForDefaultLandingLabel(label: string) {
  switch (label) {
    case "系统默认":
      return "";
    case "反馈":
      return "/feedback";
    default:
      throw new Error(`未支持的默认进入页面选项: ${label}`);
  }
}

function defaultLandingPathForLabel(label: string) {
  return valueForDefaultLandingLabel(label) || null;
}

function valueForSidebarLabel(label: string): SidebarPreferenceState {
  switch (label) {
    case "系统默认":
      return "system";
    case "展开":
      return "expanded";
    case "折叠":
      return "collapsed";
    default:
      throw new Error(`未支持的侧边栏默认状态选项: ${label}`);
  }
}

function valueForChatThemeLabel(label: string): ChatThemePreference {
  switch (label) {
    case "舒适暗色":
      return "dark";
    case "经典浅色":
      return "light";
    default:
      throw new Error(`未支持的聊天界面主题选项: ${label}`);
  }
}

function requiredSidebarState(params: Record<string, unknown>, key: string): SidebarPreferenceState {
  return requiredSidebarValue(params[key]);
}

function requiredSidebarValue(value: unknown): SidebarPreferenceState {
  if (value === "system" || value === "expanded" || value === "collapsed") {
    return value;
  }
  throw new Error("侧边栏默认状态必须是 system、expanded 或 collapsed");
}

function requiredChatTheme(params: Record<string, unknown>, key: string): ChatThemePreference {
  return requiredChatThemeValue(params[key]);
}

function requiredChatThemeValue(value: unknown): ChatThemePreference {
  if (value === "dark" || value === "light") {
    return value;
  }
  throw new Error("聊天界面主题必须是 dark 或 light");
}

function requiredBoolean(params: Record<string, unknown>, key: string) {
  const value = params[key];
  if (typeof value === "boolean") {
    return value;
  }
  throw new Error(`参数 ${key} 必须是布尔值`);
}

function requiredSettingsSnapshot(params: Record<string, unknown>, key: string): SettingsSnapshot {
  const value = params[key];
  if (!value || typeof value !== "object") {
    throw new Error(`参数 ${key} 必须是个人设置快照`);
  }
  return value as SettingsSnapshot;
}

async function installClientBridgeMocks(page: Page) {
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
    window.orfNativeNotifications = {
      onOpenChatTarget: () => () => undefined,
      showChatMessage: async () => ({ status: "success" }),
    };
  });
}
