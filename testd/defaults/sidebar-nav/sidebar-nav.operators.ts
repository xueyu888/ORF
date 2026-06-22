import { expect, type Locator, type Page } from "@playwright/test";
import type { OperatorRegistry } from "../../_framework/types";
import { clearBrowserState } from "../../_operators/common.helpers";
import { requiredString } from "../../_operators/params";
import type { SidebarNavCaseData, TestContext } from "./_support/sidebar-nav.context";
import { setDefaultLandingPathByEmail } from "./_support/sidebar-nav.helpers";

export const sidebarNavOperators = {
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
    observe: async ({ ctx }) => {
      await expect(sidebar(ctx.page)).toBeVisible();
    },
    collapsed: async ({ ctx, params }) => {
      const expected = params.expected === true;
      await waitForSidebarState(ctx.page, expected);
    },
  },
  "page.sidebar.toggle": {
    click: async ({ ctx, params }) => {
      const name = requiredString(params, "name");
      await ctx.page.getByRole("button", { name, exact: true }).click();
      if (name.includes("折叠")) {
        await ensureSidebarState(ctx.page, true);
      }
      if (name.includes("展开")) {
        await ensureSidebarState(ctx.page, false);
      }
    },
  },
  "page.sidebar_item": {
    visible: async ({ ctx, params }) => {
      await expect(sidebarLink(ctx.page, requiredString(params, "name"))).toBeVisible();
    },
    enabled: async ({ ctx, params }) => {
      await expect(sidebarLink(ctx.page, requiredString(params, "name"))).toBeEnabled();
    },
  },
  "page.sidebar_label": {
    visible: async ({ ctx, params }) => {
      await expect(sidebarLabel(ctx.page, requiredString(params, "name"))).toBeVisible();
    },
    hidden: async ({ ctx, params }) => {
      for (const name of requiredNames(params)) {
        await expect(sidebarLabel(ctx.page, name)).toBeHidden();
      }
    },
  },
  "page.sidebar_icon": {
    visible: async ({ ctx, params }) => {
      for (const name of requiredNames(params)) {
        await expect(sidebarLink(ctx.page, name).locator("svg")).toBeVisible();
      }
    },
  },
} satisfies OperatorRegistry<TestContext, SidebarNavCaseData>;

function sidebar(page: Page) {
  return page.locator("aside.orf-sidebar[aria-label='主导航']");
}

async function waitForSidebarState(page: Page, collapsed: boolean) {
  await expect
    .poll(async () => await isSidebarState(page, collapsed), {
      message: collapsed ? "等待侧边栏稳定为折叠状态" : "等待侧边栏稳定为展开状态",
      timeout: 10000,
    })
    .toBe(true);
}

async function ensureSidebarState(page: Page, collapsed: boolean) {
  const deadline = Date.now() + 10000;
  const toggleName = collapsed ? "折叠侧边栏" : "展开侧边栏";

  while (Date.now() < deadline) {
    if (await isSidebarState(page, collapsed)) {
      await page.waitForTimeout(500);
      if (await isSidebarState(page, collapsed)) {
        return;
      }
    }

    const toggle = page.getByRole("button", { name: toggleName, exact: true });
    if (await toggle.isVisible().catch(() => false)) {
      await toggle.click();
    }
    await page.waitForTimeout(150);
  }

  throw new Error(collapsed ? "侧边栏未能稳定为折叠状态" : "侧边栏未能稳定为展开状态");
}

async function isSidebarState(page: Page, collapsed: boolean) {
  const className = await sidebar(page).getAttribute("class").catch(() => null);
  return className?.includes(collapsed ? "orf-sidebar-collapsed" : "orf-sidebar-expanded") === true;
}

function sidebarLink(page: Page, name: string) {
  return sidebar(page).getByRole("link", { name, exact: true });
}

function sidebarLabel(page: Page, name: string) {
  return sidebarLink(page, name).locator(".orf-sidebar-link-label");
}

function requiredNames(params: Record<string, unknown>) {
  const names = params.names;
  if (!Array.isArray(names) || !names.every((item) => typeof item === "string")) {
    throw new Error("参数 names 必须是字符串数组");
  }
  return names;
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
