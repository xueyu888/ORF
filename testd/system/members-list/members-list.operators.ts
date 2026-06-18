import { expect, type Page } from "@playwright/test";
import type { OperatorRegistry } from "../../_framework/types";
import { clearBrowserState } from "../../_operators/common.helpers";
import { requiredString } from "../../_operators/params";
import type { SystemMembersListCaseData, TestContext } from "./_support/members-list.context";
import { setDefaultLandingPathByEmail } from "./_support/members-list.helpers";

export const systemMembersListOperators = {
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
  "page.members_list": {
    visible: async ({ ctx }) => {
      await expect(membersTable(ctx.page)).toBeVisible();
    },
  },
  "page.members_user_row": {
    observe: async ({ ctx, params }) => {
      await expect(userRow(ctx.page, requiredString(params, "email"))).toBeVisible();
    },
    visible: async ({ ctx, params }) => {
      await expect(userRow(ctx.page, requiredString(params, "email"))).toBeVisible();
    },
  },
  "page.members_table_header": {
    contains: async ({ ctx, params }) => {
      await expect(membersTable(ctx.page).locator("thead")).toContainText(requiredString(params, "label"));
    },
  },
  "page.members_user_row_avatar": {
    visible: async ({ ctx, params }) => {
      await expect(userRow(ctx.page, requiredString(params, "email")).locator(".orf-user-row-avatar")).toBeVisible();
    },
  },
  "page.members_user_row_name": {
    text: async ({ ctx, params }) => {
      await expect(userRow(ctx.page, requiredString(params, "email")).locator(".orf-user-name")).toHaveText(requiredString(params, "text"));
    },
  },
  "page.members_user_row_email": {
    text: async ({ ctx, params }) => {
      await expect(userRowCell(ctx.page, requiredString(params, "email"), 1)).toHaveText(requiredString(params, "text"));
    },
  },
  "page.members_user_row_role": {
    text: async ({ ctx, params }) => {
      await expect(userRow(ctx.page, requiredString(params, "email")).locator(".orf-user-role-select")).toHaveText(requiredString(params, "text"));
    },
  },
  "page.members_user_row_status": {
    text: async ({ ctx, params }) => {
      await expect(userRow(ctx.page, requiredString(params, "email")).locator(".orf-user-status")).toHaveText(requiredString(params, "text"));
    },
  },
  "page.members_user_row_last_online": {
    visible: async ({ ctx, params }) => {
      await expect(lastOnlineCell(ctx.page, requiredString(params, "email"))).toBeVisible();
    },
    not_empty: async ({ ctx, params }) => {
      await expect.poll(async () => normalizeText(await lastOnlineCell(ctx.page, requiredString(params, "email")).textContent())).not.toBe("");
    },
  },
  "page.members_user_row_action": {
    visible: async ({ ctx, params }) => {
      await expect(rowAction(ctx.page, params)).toBeVisible();
    },
    enabled: async ({ ctx, params }) => {
      await expect(rowAction(ctx.page, params)).toBeEnabled();
    },
  },
} satisfies OperatorRegistry<TestContext, SystemMembersListCaseData>;

function membersTitle(page: Page) {
  return page.locator(".orf-topbar-title").filter({ hasText: "成员管理" });
}

function membersTable(page: Page) {
  return page.locator("table.orf-user-table");
}

function userRow(page: Page, email: string) {
  return membersTable(page).locator("tbody tr", { hasText: email });
}

function userRowCell(page: Page, email: string, index: number) {
  return userRow(page, email).locator("td").nth(index);
}

function lastOnlineCell(page: Page, email: string) {
  return userRow(page, email).locator(".orf-user-last-online");
}

function rowAction(page: Page, params: Record<string, unknown>) {
  return userRow(page, requiredString(params, "email")).getByRole("button", {
    name: requiredString(params, "action"),
    exact: true,
  });
}

function normalizeText(value: string | null) {
  return (value ?? "").trim();
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
