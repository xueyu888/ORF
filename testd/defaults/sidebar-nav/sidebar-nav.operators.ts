import { expect, type Locator, type Page } from "@playwright/test";
import type { OperatorRegistry } from "../../_framework/types";
import { clearBrowserState } from "../../_operators/common.helpers";
import { requiredString } from "../../_operators/params";
import type { SidebarNavCaseData, TestContext } from "./_support/sidebar-nav.context";
import { readSidebarCollapsedByEmail, setDefaultLandingPathByEmail, setSidebarCollapsedByEmail } from "./_support/sidebar-nav.helpers";

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
    set_sidebar_collapsed_by_email: async ({ params }) => {
      await setSidebarCollapsedByEmail(requiredString(params, "email"), params.collapsed === true);
    },
    reset_sidebar_collapsed_by_email: async ({ params }) => {
      await setSidebarCollapsedByEmail(requiredString(params, "email"), null);
    },
  },
	  "page.sidebar": {
	    observe: async ({ ctx }) => {
	      await expect(sidebar(ctx.page)).toBeVisible();
	    },
	    collapsed: async ({ ctx, params }) => {
	      const expected = params.expected === true;
	      await expect(sidebar(ctx.page)).toHaveClass(expected ? /orf-sidebar-collapsed/ : /orf-sidebar-expanded/, { timeout: 15_000 });
	    },
	  },
	  "page.sidebar.toggle": {
	    click: async ({ ctx, params }) => {
	      const email = typeof params.email === "string" ? params.email : null;
	      const expectedCollapsed = typeof params.expectedCollapsed === "boolean" ? params.expectedCollapsed : null;
	      if (expectedCollapsed === null) {
	        await ctx.page.getByRole("button", { name: requiredString(params, "name"), exact: true }).click();
	        return;
	      }
	      await toggleSidebarUntilState(ctx.page, requiredString(params, "name"), expectedCollapsed);
	      if (email) {
	        await expect.poll(() => readSidebarCollapsedByEmail(email), { timeout: 15_000 }).toBe(expectedCollapsed);
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

function waitForSidebarPreferenceSave(page: Page, expectedCollapsed: boolean) {
  return page.waitForResponse((response) => {
    const request = response.request();
    if (request.method().toUpperCase() !== "PUT" || !response.url().includes("/api/settings/personal/preferences")) {
      return false;
    }
    const body = request.postDataJSON() as { sidebarCollapsed?: unknown } | null;
    return body?.sidebarCollapsed === expectedCollapsed;
  }, { timeout: 15_000 });
}

async function toggleSidebarUntilState(page: Page, buttonName: string, expectedCollapsed: boolean) {
  const expectedClass = expectedCollapsed ? /orf-sidebar-collapsed/ : /orf-sidebar-expanded/;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (await sidebarHasClass(page, expectedClass)) {
      return;
    }
    const responsePromise = waitForSidebarPreferenceSave(page, expectedCollapsed);
    await page.getByRole("button", { name: buttonName, exact: true }).click({ timeout: 10_000 });
    await responsePromise;
    try {
      await expect(sidebar(page)).toHaveClass(expectedClass, { timeout: 15_000 });
      return;
    } catch (error) {
      if (attempt === 2) {
        throw error;
      }
    }
  }
}

async function sidebarHasClass(page: Page, expectedClass: RegExp) {
  return sidebar(page)
    .evaluate((element) => element.className)
    .then((className) => expectedClass.test(String(className)))
    .catch(() => false);
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
