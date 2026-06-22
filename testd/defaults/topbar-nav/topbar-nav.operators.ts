import { expect, type Locator, type Page } from "@playwright/test";
import type { OperatorRegistry } from "../../_framework/types";
import { clearBrowserState } from "../../_operators/common.helpers";
import { requiredString } from "../../_operators/params";
import type { TestContext, TopbarNavCaseData } from "./_support/topbar-nav.context";
import { setDefaultLandingPathByEmail } from "./_support/topbar-nav.helpers";

export const topbarNavOperators = {
  browser: {
    clear_state: async ({ ctx }) => {
      await ctx.context.clearCookies();
      await clearBrowserState(ctx.page);
      await installDesktopShellMock(ctx.page);
    },
  },

  "user.preferences": {
    set_default_landing_path_by_email: async ({ params }) => {
      await setDefaultLandingPathByEmail(
        requiredString(params, "email"),
        requiredString(params, "path"),
      );
    },

    reset_default_landing_path_by_email: async ({ params }) => {
      await setDefaultLandingPathByEmail(requiredString(params, "email"), null);
    },
  },

  topbar: {
    visible: async ({ ctx }) => {
      await expect(topbar(ctx.page)).toBeVisible();
    },

    observe: async ({ ctx }) => {
      await expect(topbar(ctx.page)).toBeVisible();
    },
  },

  "topbar.title_area": {
    visible: async ({ ctx }) => {
      await expect(topbar(ctx.page).locator(".orf-topbar-title")).toBeVisible();
    },
  },

  "topbar.actions": {
    visible: async ({ ctx }) => {
      await expect(topbar(ctx.page).locator(".orf-topbar-actions")).toBeVisible();
    },
  },

  "topbar.title": {
    text: async ({ ctx, params }) => {
      await expect(topbar(ctx.page).locator(".orf-topbar-title")).toContainText(
        requiredString(params, "text"),
      );
    },
  },

  "topbar.search": visibleEnabled(topbarButtonByLabel("搜索页面、目标、指标、任务、反馈")),
  "topbar.feedback": visibleEnabled(topbarButtonByRole("新建反馈")),
  "topbar.window.minimize": visibleEnabled(topbarButtonByLabel("最小化")),
  "topbar.window.restore": visibleEnabled(topbarButtonByLabel("还原窗口")),
  "topbar.window.close_to_tray": visibleEnabled(topbarButtonByLabel("关闭到托盘")),
} satisfies OperatorRegistry<TestContext, TopbarNavCaseData>;

function topbar(page: Page) {
  return page.locator("header.orf-topbar");
}

function topbarButtonByRole(name: string | RegExp) {
  return (page: Page) => topbar(page).getByRole("button", { name });
}

function topbarButtonByLabel(label: string | RegExp) {
  return (page: Page) => topbar(page).getByLabel(label);
}

function visibleEnabled(locatorFactory: (page: Page) => Locator) {
  return {
    visible: async ({ ctx }: { ctx: TestContext }) => {
      await expect(locatorFactory(ctx.page)).toBeVisible();
    },
    enabled: async ({ ctx }: { ctx: TestContext }) => {
      await expect(locatorFactory(ctx.page)).toBeEnabled();
    },
  };
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
