import { expect, type Page } from "@playwright/test";
import type { OperatorRegistry } from "../../_framework/types";
import { clearBrowserState } from "../../_operators/common.helpers";
import { requiredNumber, requiredString } from "../../_operators/params";
import type { SystemMembersOverviewCaseData, TestContext } from "./_support/members-overview.context";
import { setDefaultLandingPathByEmail } from "./_support/members-overview.helpers";

export const systemMembersOverviewOperators = {
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
  "page.members_title": {
    visible: async ({ ctx }) => {
      await expect(membersTitle(ctx.page)).toBeVisible();
    },
  },
  "page.members_page": {
    observe: async ({ ctx }) => {
      await expect(ctx.page).toHaveURL(/\/system\/members$/);
      await expect(membersTitle(ctx.page)).toBeVisible();
      await expect(membersTable(ctx.page)).toBeVisible();
    },
  },
  "page.members_search": {
    visible: async ({ ctx }) => {
      await expect(membersSearch(ctx.page)).toBeVisible();
    },
    placeholder: async ({ ctx, params }) => {
      await expect(membersSearch(ctx.page)).toHaveAttribute("placeholder", requiredString(params, "value"));
    },
  },
  "page.members_role_filter": {
    visible: async ({ ctx }) => {
      await expect(roleFilter(ctx.page)).toBeVisible();
    },
    has_option: async ({ ctx, params }) => {
      await expect(roleFilter(ctx.page).locator("option", { hasText: requiredString(params, "label") })).toHaveCount(1);
    },
  },
  "page.members_list": {
    visible: async ({ ctx }) => {
      await expect(membersTable(ctx.page)).toBeVisible();
    },
    contains_user: async ({ ctx, params }) => {
      const row = memberRow(ctx.page, requiredString(params, "email"));
      await expect(row).toBeVisible();
      await expect(row).toContainText(requiredString(params, "name"));
    },
  },
  "page.members_add_button": {
    visible: async ({ ctx }) => {
      await expect(addUserButton(ctx.page)).toBeVisible();
    },
    enabled: async ({ ctx }) => {
      await expect(addUserButton(ctx.page)).toBeEnabled();
    },
  },
  "page.members_user_stat": {
    visible: async ({ ctx }) => {
      await expect(userStat(ctx.page)).toBeVisible();
    },
    at_least: async ({ ctx, params }) => {
      expect(await statNumber(userStat(ctx.page))).toBeGreaterThanOrEqual(requiredNumber(params, "min"));
    },
  },
  "page.members_role_stat": {
    visible: async ({ ctx }) => {
      await expect(roleStat(ctx.page)).toBeVisible();
    },
    at_least: async ({ ctx, params }) => {
      expect(await statNumber(roleStat(ctx.page))).toBeGreaterThanOrEqual(requiredNumber(params, "min"));
    },
  },
} satisfies OperatorRegistry<TestContext, SystemMembersOverviewCaseData>;

function membersTitle(page: Page) {
  return page.locator(".orf-topbar-title").filter({ hasText: "成员管理" });
}

function membersSearch(page: Page) {
  return page.getByPlaceholder("搜索姓名或邮箱");
}

function roleFilter(page: Page) {
  return page.locator("label.orf-user-select").filter({ hasText: "角色" }).locator("select");
}

function membersTable(page: Page) {
  return page.locator("table.orf-user-table");
}

function memberRow(page: Page, email: string) {
  return membersTable(page).locator("tbody tr", { hasText: email });
}

function addUserButton(page: Page) {
  return page.getByRole("button", { name: "新增用户", exact: true });
}

function userStat(page: Page) {
  return page.locator(".orf-permission-metrics").getByText(/用户$/);
}

function roleStat(page: Page) {
  return page.locator(".orf-permission-metrics").getByText(/角色$/);
}

async function statNumber(locator: ReturnType<Page["locator"]>) {
  const text = (await locator.textContent()) ?? "";
  const value = Number.parseInt(text.replace(/\D+/g, ""), 10);
  if (Number.isNaN(value)) {
    throw new Error(`无法从统计文本中解析数字：${text}`);
  }
  return value;
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
