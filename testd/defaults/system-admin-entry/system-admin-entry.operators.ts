import { expect, type Page } from "@playwright/test";
import type { OperatorRegistry } from "../../_framework/types";
import { clearBrowserState } from "../../_operators/common.helpers";
import { requiredString } from "../../_operators/params";
import type { SystemAdminEntryCaseData, TestContext } from "./_support/system-admin-entry.context";
import { setDefaultLandingPathByEmail } from "./_support/system-admin-entry.helpers";

type SystemEntrySnapshot = {
  visible: boolean;
  enabled: boolean;
};

export const systemAdminEntryOperators = {
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
    observe: async ({ ctx }) => {
      await expect(sidebar(ctx.page)).toBeVisible();
    },
    observe_admin_system_entry: async ({ ctx }) => {
      await expect(sidebar(ctx.page)).toBeVisible();

      const systemEntry = sidebarSystemEntry(ctx.page);
      await expect(systemEntry).toBeVisible();
      await expect(systemEntry).toBeEnabled();

      return {
        visible: await systemEntry.isVisible(),
        enabled: await systemEntry.isEnabled(),
      } satisfies SystemEntrySnapshot;
    },
  },
  "page.sidebar_base_entries": {
    visible: async ({ ctx }) => {
      for (const name of ["悬赏大厅", "我的挑战", "反馈", "统计"]) {
        await expect(sidebarLink(ctx.page, name)).toBeVisible();
      }
    },
  },
  "page.sidebar_system_entry": {
    hidden: async ({ ctx }) => {
      await expect(sidebar(ctx.page).getByRole("link", { name: "系统管理", exact: true })).toHaveCount(0);
    },
  },
  "page.sidebar_system_entry_snapshot": {
    visible: async ({ params }) => {
      expect(systemEntrySnapshot(params).visible).toBe(true);
    },
    enabled: async ({ params }) => {
      expect(systemEntrySnapshot(params).enabled).toBe(true);
    },
  },
} satisfies OperatorRegistry<TestContext, SystemAdminEntryCaseData>;

function sidebar(page: Page) {
  return page.locator("aside.orf-sidebar[aria-label='主导航']");
}

function sidebarLink(page: Page, name: string) {
  return sidebar(page).getByRole("link", { name, exact: true });
}

function sidebarSystemEntry(page: Page) {
  return sidebarLink(page, "系统管理");
}

function systemEntrySnapshot(params: Record<string, unknown>): SystemEntrySnapshot {
  const snapshot = params.snapshot;
  if (
    !snapshot ||
    typeof snapshot !== "object" ||
    typeof (snapshot as Partial<SystemEntrySnapshot>).visible !== "boolean" ||
    typeof (snapshot as Partial<SystemEntrySnapshot>).enabled !== "boolean"
  ) {
    throw new Error("参数 snapshot 必须包含 visible 和 enabled 布尔值");
  }

  return snapshot as SystemEntrySnapshot;
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
