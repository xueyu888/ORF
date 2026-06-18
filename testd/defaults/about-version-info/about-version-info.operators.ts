import { expect, type Page } from "@playwright/test";
import type { OperatorRegistry } from "../../_framework/types";
import { clearBrowserState } from "../../_operators/common.helpers";
import { requiredString } from "../../_operators/params";
import type { AboutVersionInfoCaseData, TestContext } from "./_support/about-version-info.context";
import { setDefaultLandingPathByEmail } from "./_support/about-version-info.helpers";

declare global {
  interface Window {
    __orfTestOpenedExternalUrl?: string | null;
  }
}

type UserMenuSnapshot = {
  items: Record<string, boolean>;
  visible: boolean;
};

type ReleaseNotesSnapshot = {
  openedUrl: string | null;
};

export const aboutVersionInfoOperators = {
  browser: {
    clear_state: async ({ ctx }) => {
      await ctx.context.clearCookies();
      await clearBrowserState(ctx.page);
      await installClientBridgeMocks(ctx.page);
    },
  },
  "client_update.check": {
    available: async ({ ctx }) => {
      await installClientUpdateRoute(ctx.page);
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
      await sidebarUserButton(ctx.page).evaluate((element) => (element as HTMLButtonElement).click());
      await expect(userMenu(ctx.page)).toBeVisible();
      return userMenuSnapshot(ctx.page);
    },
  },
  user_menu: {
    visible: async ({ ctx, params }) => {
      const snapshot = optionalUserMenuSnapshot(params);
      if (snapshot) {
        expect(snapshot.visible).toBe(true);
        return;
      }
      await expect(userMenu(ctx.page)).toBeVisible();
    },
  },
  "user_menu.item": {
    visible: async ({ ctx, params }) => {
      const snapshot = optionalUserMenuSnapshot(params);
      const name = requiredString(params, "name");
      if (snapshot) {
        expect(snapshot.items[name]).toBe(true);
        return;
      }
      await ensureUserMenuOpen(ctx.page);
      await expect(menuItem(ctx.page, name)).toBeVisible();
    },
    enabled: async ({ ctx, params }) => {
      await ensureUserMenuOpen(ctx.page);
      await expect(menuItem(ctx.page, requiredString(params, "name"))).toBeEnabled();
    },
  },
  "page.user_menu_item": {
    click: async ({ ctx, params }) => {
      const name = requiredString(params, "name");
      await ensureUserMenuOpen(ctx.page);
      await menuItem(ctx.page, name).evaluate((element) => (element as HTMLElement).click());
      if (name === "关于与更新") {
        await expect(aboutDialog(ctx.page)).toBeVisible();
      }
    },
  },
  about_update_dialog: {
    visible: async ({ ctx }) => {
      await expect(aboutDialog(ctx.page)).toBeVisible();
    },
    hidden: async ({ ctx }) => {
      await expect(aboutDialog(ctx.page)).toHaveCount(0);
    },
    contains_text: async ({ ctx, params }) => {
      await expect(aboutDialog(ctx.page).getByText(requiredString(params, "text"), { exact: true })).toBeVisible();
    },
    contains_heading: async ({ ctx, params }) => {
      await expect(aboutDialog(ctx.page).getByRole("heading", { name: requiredString(params, "name"), exact: true })).toBeVisible();
    },
  },
  "about_update_dialog.fact": {
    visible: async ({ ctx, params }) => {
      const label = requiredString(params, "label");
      await waitForUpdateFacts(ctx.page);
      const fact = aboutDialog(ctx.page).locator(".orf-client-update-center-facts > div").filter({ has: ctx.page.locator("dt", { hasText: label }) }).first();
      await expect(fact.locator("dt")).toHaveText(label);
      await expect(fact.locator("dd")).toBeVisible();
      await expect.poll(async () => (await fact.locator("dd").innerText()).trim().length > 0).toBe(true);
    },
  },
  "about_update_dialog.action": {
    visible: async ({ ctx, params }) => {
      await expect(aboutDialog(ctx.page).getByRole("button", { name: requiredString(params, "name"), exact: true })).toBeVisible();
    },
  },
  "about_update_dialog.release_notes": {
    click: async ({ ctx }) => {
      await ctx.page.evaluate(() => {
        window.__orfTestOpenedExternalUrl = null;
      });
      await aboutDialog(ctx.page).getByRole("button", { name: "发布说明", exact: true }).click();
      await expect.poll(() => ctx.page.evaluate(() => window.__orfTestOpenedExternalUrl ?? null)).not.toBeNull();
      const openedUrl = await ctx.page.evaluate(() => window.__orfTestOpenedExternalUrl ?? null);
      return { openedUrl } satisfies ReleaseNotesSnapshot;
    },
  },
  release_notes: {
    accessible: async ({ params }) => {
      const snapshot = requiredReleaseNotesSnapshot(params, "snapshot");
      expect(snapshot.openedUrl).toMatch(/^https:\/\/github\.com\/xueyu888\/ORF\/releases/);
    },
  },
} satisfies OperatorRegistry<TestContext, AboutVersionInfoCaseData>;

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

function aboutDialog(page: Page) {
  return page.getByRole("dialog", { name: /版本与更新/ });
}

async function ensureUserMenuOpen(page: Page) {
  if (!(await userMenu(page).isVisible().catch(() => false))) {
    await sidebarUserButton(page).evaluate((element) => (element as HTMLButtonElement).click());
  }
  await expect(userMenu(page)).toBeVisible();
}

async function userMenuSnapshot(page: Page): Promise<UserMenuSnapshot> {
  const items: Record<string, boolean> = {};
  for (const name of ["查看头像", "个人设置", "关于与更新", "退出登录"]) {
    items[name] = await menuItem(page, name).isVisible().catch(() => false);
  }
  return {
    items,
    visible: await userMenu(page).isVisible(),
  };
}

async function waitForUpdateFacts(page: Page) {
  await expect(aboutDialog(page).locator(".orf-client-update-center-facts")).toBeVisible();
}

function optionalUserMenuSnapshot(params: Record<string, unknown>): UserMenuSnapshot | undefined {
  const snapshot = params.snapshot;
  if (snapshot === undefined || snapshot === null) {
    return undefined;
  }
  if (
    typeof snapshot === "object" &&
    typeof (snapshot as UserMenuSnapshot).visible === "boolean" &&
    typeof (snapshot as UserMenuSnapshot).items === "object" &&
    (snapshot as UserMenuSnapshot).items !== null
  ) {
    return snapshot as UserMenuSnapshot;
  }
  throw new Error("参数 snapshot 必须包含 visible 和 items");
}

function requiredReleaseNotesSnapshot(params: Record<string, unknown>, key: string): ReleaseNotesSnapshot {
  const value = params[key];
  if (!value || typeof value !== "object" || typeof (value as ReleaseNotesSnapshot).openedUrl !== "string") {
    throw new Error(`参数 ${key} 必须是发布说明快照`);
  }
  return value as ReleaseNotesSnapshot;
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
    window.__orfTestOpenedExternalUrl = null;
    window.orfDesktopShell = {
      closeWindow: async () => ({ data: maximizedState, status: "success" }),
      getWindowState: async () => ({ data: maximizedState, status: "success" }),
      minimizeWindow: async () => ({ data: { ...maximizedState, isMinimized: true }, status: "success" }),
      onWindowStateChange: () => () => undefined,
      setWorkbenchZoomLevel: async ({ level }) => ({ data: { level }, status: "success" }),
      toggleMaximizeWindow: async () => ({ data: maximizedState, status: "success" }),
    };
    window.orfNativeRuntime = {
      getInfo: async () => ({
        platform: "win32",
        version: "0.0.31",
      }),
      openExternal: async (url) => {
        window.__orfTestOpenedExternalUrl = url;
        return { status: "success" };
      },
    };
  });
}

async function installClientUpdateRoute(page: Page) {
  await page.route("**/api/client-updates/latest", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      status: 200,
      body: JSON.stringify({
        release: {
          assets: [
            {
              contentType: "application/x-msdownload",
              downloadUrl: "https://github.com/xueyu888/ORF/releases/download/v0.0.32/ORF-Setup-0.0.32.exe",
              name: "ORF-Setup-0.0.32.exe",
              size: 10485760,
            },
          ],
          body: "ORF 0.0.32 测试发布说明",
          htmlUrl: "https://github.com/xueyu888/ORF/releases/tag/v0.0.32",
          isDraft: false,
          isPrerelease: false,
          name: "ORF 0.0.32",
          publishedAt: "2026-06-18T00:00:00.000Z",
          tagName: "v0.0.32",
          version: "0.0.32",
        },
      }),
    });
  });
}
