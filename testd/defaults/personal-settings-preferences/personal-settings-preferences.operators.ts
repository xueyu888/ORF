import { expect, type Page } from "@playwright/test";
import type { OperatorRegistry } from "../../_framework/types";
import { clearBrowserState } from "../../_operators/common.helpers";
import { requiredString } from "../../_operators/params";
import type { PersonalSettingsPreferencesCaseData, TestContext } from "./_support/personal-settings-preferences.context";
import {
  readDefaultLandingPathByEmail,
  readSidebarStateByEmail,
  setDefaultLandingPathByEmail,
  setSidebarStateByEmail,
  type SidebarPreferenceState,
} from "./_support/personal-settings-preferences.helpers";

type PreferencesSnapshot = {
  defaultLandingPath?: string | null;
  pageUrl: string;
  savedSidebarState?: SidebarPreferenceState;
  sidebarState?: SidebarPreferenceState;
};

export const personalSettingsPreferencesOperators = {
  browser: {
    clear_state: async ({ ctx }) => {
      await ctx.context.clearCookies();
      await clearBrowserState(ctx.page);
      await installDesktopShellMock(ctx.page);
    },
  },
  "user.preferences": {
    reset_default_landing_path_by_email: async ({ params }) => {
      await setDefaultLandingPathByEmail(requiredString(params, "email"), null);
    },
    set_sidebar_state_by_email: async ({ params }) => {
      await setSidebarStateByEmail(requiredString(params, "email"), requiredSidebarState(params, "state"));
    },
    default_landing_is: async ({ params }) => {
      const expected = params.path === null ? null : requiredString(params, "path");
      await expect.poll(() => readDefaultLandingPathByEmail(requiredString(params, "email"))).toBe(expected);
    },
    sidebar_state_is: async ({ params }) => {
      await expect.poll(() => readSidebarStateByEmail(requiredString(params, "email"))).toBe(requiredSidebarState(params, "state"));
    },
  },
  "personal_settings.page": {
    visible: async ({ ctx, params }) => {
      await expect(ctx.page).toHaveURL(new RegExp(requiredString(params, "pattern")));
      await expect(ctx.page.getByRole("heading", { name: "个人设置", exact: true })).toBeVisible();
    },
  },
  "personal_settings.default_landing": {
    selected: async ({ ctx, params }) => {
      await expect(settingsSelect(ctx.page, "默认进入页面")).toHaveValue(valueForDefaultLandingLabel(requiredString(params, "label")));
    },
    enabled: async ({ ctx }) => {
      await expect(settingsSelect(ctx.page, "默认进入页面")).toBeEnabled();
    },
    select: async ({ ctx, params }) => {
      const label = requiredString(params, "label");
      const email = requiredString(params, "email");
      const expectedPath = valueForDefaultLandingLabel(label) || null;
      await settingsSelect(ctx.page, "默认进入页面").selectOption({ label });
      await expect(settingsSelect(ctx.page, "默认进入页面")).toHaveValue(valueForDefaultLandingLabel(label));
      await expect.poll(() => readDefaultLandingPathByEmail(email)).toBe(expectedPath);
      return {
        defaultLandingPath: await readDefaultLandingPathByEmail(email),
        pageUrl: ctx.page.url(),
      } satisfies PreferencesSnapshot;
    },
  },
  "personal_settings.sidebar_state": {
    selected: async ({ ctx, params }) => {
      await expect(settingsSelect(ctx.page, "侧边栏默认状态")).toHaveValue(valueForSidebarLabel(requiredString(params, "label")));
    },
    enabled: async ({ ctx }) => {
      await expect(settingsSelect(ctx.page, "侧边栏默认状态")).toBeEnabled();
    },
    select: async ({ ctx, params }) => {
      const label = requiredString(params, "label");
      const email = requiredString(params, "email");
      const expectedState = valueForSidebarLabel(label) as SidebarPreferenceState;
      await settingsSelect(ctx.page, "侧边栏默认状态").selectOption({ label });
      await expect(settingsSelect(ctx.page, "侧边栏默认状态")).toHaveValue(valueForSidebarLabel(label));
      await expect.poll(() => readSidebarStateByEmail(email)).toBe(expectedState);
      return {
        pageUrl: ctx.page.url(),
        savedSidebarState: await readSidebarStateByEmail(email),
        sidebarState: await currentSidebarState(ctx.page),
      } satisfies PreferencesSnapshot;
    },
  },
  preferences_flow: {
    open_settings_from_current_page: async ({ ctx, params }) => {
      await expect(ctx.page).toHaveURL(new RegExp(requiredString(params, "expectedPathPattern")));
      const snapshot: PreferencesSnapshot = {
        pageUrl: ctx.page.url(),
        sidebarState: await currentSidebarState(ctx.page),
      };
      await ctx.page.goto("/settings");
      await expect(ctx.page).toHaveURL(/\/settings$/);
      await expect(ctx.page.getByRole("heading", { name: "个人设置", exact: true })).toBeVisible();
      return snapshot;
    },
  },
  preferences_login_form: {
    submit_capture_sidebar: async ({ ctx }) => {
      await ctx.page.getByRole("button", { name: "Sign In", exact: true }).click();
      await expect(ctx.page).toHaveURL(/\/tasks$/);
      await expect(sidebar(ctx.page)).toBeVisible();
      return {
        pageUrl: ctx.page.url(),
        sidebarState: await currentSidebarState(ctx.page),
      } satisfies PreferencesSnapshot;
    },
  },
  preferences_snapshot: {
    page_matches: async ({ params }) => {
      const snapshot = requiredPreferencesSnapshot(params, "snapshot");
      expect(snapshot.pageUrl).toMatch(new RegExp(requiredString(params, "pattern")));
    },
    sidebar_state: async ({ params }) => {
      const snapshot = requiredPreferencesSnapshot(params, "snapshot");
      expect(snapshot.sidebarState).toBe(requiredSidebarState(params, "state"));
    },
    default_landing: async ({ params }) => {
      const snapshot = requiredPreferencesSnapshot(params, "snapshot");
      const expected = params.path === null ? null : requiredString(params, "path");
      expect(snapshot.defaultLandingPath).toBe(expected);
    },
    saved_sidebar_state: async ({ params }) => {
      const snapshot = requiredPreferencesSnapshot(params, "snapshot");
      expect(snapshot.savedSidebarState).toBe(requiredSidebarState(params, "state"));
    },
  },
} satisfies OperatorRegistry<TestContext, PersonalSettingsPreferencesCaseData>;

function settingsBlock(page: Page, label: string) {
  return page.locator("label").filter({ hasText: label }).first();
}

function settingsSelect(page: Page, label: string) {
  return settingsBlock(page, label).locator("select");
}

function sidebar(page: Page) {
  return page.locator("aside.orf-sidebar[aria-label='主导航']");
}

async function currentSidebarState(page: Page): Promise<SidebarPreferenceState> {
  await expect(sidebar(page)).toBeVisible();
  const className = await sidebar(page).getAttribute("class");
  return className?.includes("orf-sidebar-collapsed") ? "collapsed" : "expanded";
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

function valueForSidebarLabel(label: string) {
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

function requiredSidebarState(params: Record<string, unknown>, key: string): SidebarPreferenceState {
  const value = params[key];
  if (value === "system" || value === "expanded" || value === "collapsed") {
    return value;
  }
  throw new Error(`参数 ${key} 必须是 system、expanded 或 collapsed`);
}

function requiredPreferencesSnapshot(params: Record<string, unknown>, key: string): PreferencesSnapshot {
  const value = params[key];
  if (!value || typeof value !== "object") {
    throw new Error(`参数 ${key} 必须是偏好快照`);
  }
  return value as PreferencesSnapshot;
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
