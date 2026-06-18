import { expect, type Page } from "@playwright/test";
import type { OperatorRegistry } from "../../_framework/types";
import { clearBrowserState } from "../../_operators/common.helpers";
import { requiredString } from "../../_operators/params";
import type { AboutUpdateStatusCaseData, TestContext } from "./_support/about-update-status.context";
import { setDefaultLandingPathByEmail } from "./_support/about-update-status.helpers";

type UpdateMode = "latest" | "new";

type UpdateCheckSnapshot = {
  facts: Record<string, string>;
  installActionEnabled: boolean;
  installActionText: string;
  summaryText: string;
};

const updateModes = new WeakMap<Page, UpdateMode>();

export const aboutUpdateStatusOperators = {
  browser: {
    clear_state: async ({ ctx }) => {
      await ctx.context.clearCookies();
      await clearBrowserState(ctx.page);
      await installClientBridgeMocks(ctx.page, "0.0.0");
    },
  },
  "client_update.mock": {
    available: async ({ ctx }) => {
      updateModes.set(ctx.page, updateModes.get(ctx.page) ?? "latest");
      await installClientUpdateRoute(ctx.page);
    },
    set_latest_result: async ({ ctx }) => {
      updateModes.set(ctx.page, "latest");
      await installClientUpdateRoute(ctx.page);
    },
    set_new_version_result: async ({ ctx }) => {
      updateModes.set(ctx.page, "new");
      await installClientUpdateRoute(ctx.page);
    },
  },
  "client_update.runtime": {
    set_current_version: async ({ ctx, params }) => {
      await installClientBridgeMocks(ctx.page, requiredString(params, "version"));
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
  "sidebar.user_menu": {
    click: async ({ ctx }) => {
      await sidebarUserButton(ctx.page).evaluate((element) => (element as HTMLButtonElement).click());
      await expect(userMenu(ctx.page)).toBeVisible();
    },
  },
  "page.user_menu_item": {
    click: async ({ ctx, params }) => {
      const name = requiredString(params, "name");
      await ensureUserMenuOpen(ctx.page);
      await menuItem(ctx.page, name).evaluate((element) => (element as HTMLElement).click());
      if (name === "关于与更新") {
        await expect(aboutDialog(ctx.page)).toBeVisible();
        await waitForUpdateReady(ctx.page);
      }
    },
  },
  about_update_dialog: {
    visible: async ({ ctx }) => {
      await expect(aboutDialog(ctx.page)).toBeVisible();
    },
    contains_heading: async ({ ctx, params }) => {
      await expect(aboutDialog(ctx.page).getByRole("heading", { name: requiredString(params, "name"), exact: true })).toBeVisible();
    },
  },
  "about_update_dialog.action": {
    visible: async ({ ctx, params }) => {
      await expect(dialogButton(ctx.page, requiredString(params, "name"))).toBeVisible();
    },
    enabled: async ({ ctx, params }) => {
      await expect(dialogButton(ctx.page, requiredString(params, "name"))).toBeEnabled();
    },
  },
  "about_update_dialog.install_action": {
    text: async ({ ctx, params }) => {
      await expect(installButton(ctx.page)).toHaveText(requiredString(params, "text"));
    },
    enabled: async ({ ctx }) => {
      await expect(installButton(ctx.page)).toBeEnabled();
    },
  },
  "about_update_dialog.check_update": {
    click: async ({ ctx }) => {
      const responsePromise = ctx.page.waitForResponse((response) => response.url().includes("/api/client-updates/latest") && response.ok());
      await dialogButton(ctx.page, "检查更新").click();
      await responsePromise;
      await waitForUpdateReady(ctx.page);
      return captureUpdateCheckSnapshot(ctx.page);
    },
  },
  update_check_snapshot: {
    summary_contains: async ({ params }) => {
      expect(requiredSnapshot(params).summaryText).toContain(requiredString(params, "text"));
    },
    install_action_text: async ({ params }) => {
      expect(requiredSnapshot(params).installActionText).toBe(requiredString(params, "text"));
    },
    fact_text: async ({ params }) => {
      expect(requiredSnapshot(params).facts[requiredString(params, "label")]).toBe(requiredString(params, "text"));
    },
    fact_contains: async ({ params }) => {
      expect(requiredSnapshot(params).facts[requiredString(params, "label")]).toContain(requiredString(params, "text"));
    },
  },
} satisfies OperatorRegistry<TestContext, AboutUpdateStatusCaseData>;

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

function dialogButton(page: Page, name: string) {
  return aboutDialog(page).getByRole("button", { name, exact: true });
}

function installButton(page: Page) {
  return aboutDialog(page).getByRole("button", { name: /^(无需安装|下载并安装|正在下载)$/ }).last();
}

async function ensureUserMenuOpen(page: Page) {
  if (!(await userMenu(page).isVisible().catch(() => false))) {
    await sidebarUserButton(page).evaluate((element) => (element as HTMLButtonElement).click());
  }
  await expect(userMenu(page)).toBeVisible();
}

async function waitForUpdateReady(page: Page) {
  await expect(aboutDialog(page).locator(".orf-client-update-center-summary")).toBeVisible();
  await expect(aboutDialog(page).locator(".orf-client-update-center-facts")).toBeVisible();
}

async function captureUpdateCheckSnapshot(page: Page): Promise<UpdateCheckSnapshot> {
  await waitForUpdateReady(page);
  const facts: Record<string, string> = {};
  const factRows = aboutDialog(page).locator(".orf-client-update-center-facts > div");
  const count = await factRows.count();
  for (let index = 0; index < count; index += 1) {
    const row = factRows.nth(index);
    const label = (await row.locator("dt").innerText()).trim();
    facts[label] = (await row.locator("dd").innerText()).trim();
  }
  return {
    facts,
    installActionEnabled: await installButton(page).isEnabled(),
    installActionText: (await installButton(page).innerText()).trim(),
    summaryText: (await aboutDialog(page).locator(".orf-client-update-center-summary").innerText()).trim(),
  };
}

function requiredSnapshot(params: Record<string, unknown>): UpdateCheckSnapshot {
  const snapshot = params.snapshot;
  if (
    typeof snapshot === "object" &&
    snapshot !== null &&
    typeof (snapshot as UpdateCheckSnapshot).summaryText === "string" &&
    typeof (snapshot as UpdateCheckSnapshot).installActionText === "string"
  ) {
    return snapshot as UpdateCheckSnapshot;
  }
  throw new Error("参数 snapshot 必须是检查更新快照");
}

async function installClientBridgeMocks(page: Page, version: string) {
  await page.addInitScript((currentVersion) => {
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
    window.orfNativeRuntime = {
      getInfo: async () => ({
        platform: "win32",
        version: currentVersion,
      }),
      installUpdate: async () => ({ status: "success" }),
      openExternal: async () => ({ status: "success" }),
    };
  }, version);
}

async function installClientUpdateRoute(page: Page) {
  await page.route("**/api/client-updates/latest", async (route) => {
    const mode = updateModes.get(page) ?? "latest";
    const version = mode === "new" ? "0.0.1" : "0.0.0";
    await route.fulfill({
      contentType: "application/json",
      status: 200,
      body: JSON.stringify({
        release: {
          assets: [
            {
              contentType: "application/x-msdownload",
              downloadUrl: `https://github.com/xueyu888/ORF/releases/download/v${version}/ORF-Setup-${version}.exe`,
              name: `ORF-Setup-${version}.exe`,
              size: 10485760,
            },
          ],
          body: `ORF ${version} 测试发布说明`,
          htmlUrl: `https://github.com/xueyu888/ORF/releases/tag/v${version}`,
          isDraft: false,
          isPrerelease: false,
          name: `ORF ${version}`,
          publishedAt: "2026-06-18T00:00:00.000Z",
          tagName: `v${version}`,
          version,
        },
      }),
    });
  });
}
