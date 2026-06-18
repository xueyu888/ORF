import { expect, type Page } from "@playwright/test";
import type { OperatorRegistry } from "../../_framework/types";
import { clearBrowserState } from "../../_operators/common.helpers";
import { requiredString } from "../../_operators/params";
import type { SystemAccessControlCaseData, TestContext } from "./_support/access-control.context";
import { setDefaultLandingPathByEmail } from "./_support/access-control.helpers";

type SystemPageSnapshot = {
  isSystemPage: boolean;
  titleVisible: boolean;
};

export const systemAccessControlOperators = {
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
  "page.sidebar": {
    visible: async ({ ctx }) => {
      await expect(sidebar(ctx.page)).toBeVisible();
    },
  },
  "page.sidebar_system_entry": {
    visible: async ({ ctx }) => {
      await expect(sidebarSystemEntry(ctx.page)).toBeVisible();
    },
    enabled: async ({ ctx }) => {
      await expect(sidebarSystemEntry(ctx.page)).toBeEnabled();
    },
    click: async ({ ctx }) => {
      await sidebarSystemEntry(ctx.page).click();
      await expectSystemPage(ctx.page);

      return {
        isSystemPage: /\/system\/?$/.test(new URL(ctx.page.url()).pathname),
        titleVisible: await systemPageTitle(ctx.page).isVisible(),
      } satisfies SystemPageSnapshot;
    },
    hidden: async ({ ctx }) => {
      await expect(sidebar(ctx.page).getByRole("link", { name: "系统管理", exact: true })).toHaveCount(0);
    },
  },
  "page.system_page": {
    current: async ({ ctx }) => {
      await expectSystemPage(ctx.page);
    },
    not_current: async ({ ctx }) => {
      await expect(ctx.page).not.toHaveURL(/\/system(?:\/)?$/);
    },
  },
  "page.system_page_snapshot": {
    current: async ({ params }) => {
      expect(systemPageSnapshot(params).isSystemPage).toBe(true);
    },
    title_visible: async ({ params }) => {
      expect(systemPageSnapshot(params).titleVisible).toBe(true);
    },
  },
  "page.system_page_title": {
    visible: async ({ ctx }) => {
      await expect(systemPageTitle(ctx.page)).toBeVisible();
    },
    hidden: async ({ ctx }) => {
      await expect(systemPageTitle(ctx.page)).toHaveCount(0);
    },
  },
} satisfies OperatorRegistry<TestContext, SystemAccessControlCaseData>;

function sidebar(page: Page) {
  return page.locator("aside.orf-sidebar[aria-label='主导航']");
}

function sidebarSystemEntry(page: Page) {
  return sidebar(page).getByRole("link", { name: "系统管理", exact: true });
}

function systemPageTitle(page: Page) {
  return page.getByRole("heading", { name: "系统管理", exact: true });
}

async function expectSystemPage(page: Page) {
  await expect(page).toHaveURL(/\/system(?:\/)?$/);
  await expect(systemPageTitle(page)).toBeVisible();
}

function systemPageSnapshot(params: Record<string, unknown>): SystemPageSnapshot {
  const snapshot = params.snapshot;
  if (
    !snapshot ||
    typeof snapshot !== "object" ||
    typeof (snapshot as Partial<SystemPageSnapshot>).isSystemPage !== "boolean" ||
    typeof (snapshot as Partial<SystemPageSnapshot>).titleVisible !== "boolean"
  ) {
    throw new Error("参数 snapshot 必须包含 isSystemPage 和 titleVisible 布尔值");
  }

  return snapshot as SystemPageSnapshot;
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
