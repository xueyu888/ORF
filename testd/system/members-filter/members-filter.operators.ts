import { expect, type Page } from "@playwright/test";
import type { OperatorRegistry } from "../../_framework/types";
import { clearBrowserState } from "../../_operators/common.helpers";
import { optionalBoolean, optionalString, requiredString } from "../../_operators/params";
import type { SystemMembersFilterCaseData, TestContext } from "./_support/members-filter.context";
import { setDefaultLandingPathByEmail } from "./_support/members-filter.helpers";

type MembersSnapshot = {
  emails: string[];
  emptyMessageVisible: boolean;
};

export const systemMembersFilterOperators = {
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
  "page.members_search": {
    visible: async ({ ctx }) => {
      await expect(membersSearch(ctx.page)).toBeVisible();
    },
    fill_and_snapshot: async ({ ctx, params }) => {
      const value = requiredString(params, "value");
      await membersSearch(ctx.page).fill(value);
      await expect(membersSearch(ctx.page)).toHaveValue(value);
      await waitForExpectedRows(ctx.page, params);
      return await captureMembersSnapshot(ctx.page);
    },
    clear: async ({ ctx }) => {
      await membersSearch(ctx.page).fill("");
      await expect(membersSearch(ctx.page)).toHaveValue("");
    },
  },
  "page.members_role_filter": {
    visible: async ({ ctx }) => {
      await expect(roleFilter(ctx.page)).toBeVisible();
    },
    select_and_snapshot: async ({ ctx, params }) => {
      await roleFilter(ctx.page).selectOption({ label: requiredString(params, "label") });
      await waitForExpectedRows(ctx.page, params);
      return await captureMembersSnapshot(ctx.page);
    },
  },
  "page.members_list": {
    contains_user: async ({ ctx, params }) => {
      const row = memberRow(ctx.page, requiredString(params, "email"));
      await expect(row).toBeVisible();
      await expect(row).toContainText(requiredString(params, "name"));
    },
  },
  "page.members_snapshot": {
    contains_user: async ({ params }) => {
      expect(membersSnapshot(params).emails).toContain(requiredString(params, "email"));
    },
    lacks_user: async ({ params }) => {
      expect(membersSnapshot(params).emails).not.toContain(requiredString(params, "email"));
    },
    empty_message_visible: async ({ params }) => {
      expect(membersSnapshot(params).emptyMessageVisible).toBe(true);
    },
  },
} satisfies OperatorRegistry<TestContext, SystemMembersFilterCaseData>;

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

async function captureMembersSnapshot(page: Page): Promise<MembersSnapshot> {
  const emails = await membersTable(page)
    .locator("tbody tr td:nth-child(2)")
    .evaluateAll((cells) => cells.map((cell) => cell.textContent?.trim() ?? "").filter(Boolean));

  return {
    emails,
    emptyMessageVisible: await page.locator(".orf-user-empty", { hasText: "没有匹配的用户。" }).isVisible(),
  };
}

async function waitForExpectedRows(page: Page, params: Record<string, unknown>) {
  const visibleEmail = optionalString(params, "visibleEmail");
  if (visibleEmail) {
    await expect(memberRow(page, visibleEmail)).toBeVisible();
  }

  const secondVisibleEmail = optionalString(params, "secondVisibleEmail");
  if (secondVisibleEmail) {
    await expect(memberRow(page, secondVisibleEmail)).toBeVisible();
  }

  const hiddenEmail = optionalString(params, "hiddenEmail");
  if (hiddenEmail) {
    await expect(memberRow(page, hiddenEmail)).toHaveCount(0);
  }

  const secondHiddenEmail = optionalString(params, "secondHiddenEmail");
  if (secondHiddenEmail) {
    await expect(memberRow(page, secondHiddenEmail)).toHaveCount(0);
  }

  if (optionalBoolean(params, "expectEmpty")) {
    await expect(page.locator(".orf-user-empty", { hasText: "没有匹配的用户。" })).toBeVisible();
  }
}

function membersSnapshot(params: Record<string, unknown>): MembersSnapshot {
  const snapshot = params.snapshot;
  if (!snapshot || typeof snapshot !== "object" || !Array.isArray((snapshot as Partial<MembersSnapshot>).emails)) {
    throw new Error("参数 snapshot 必须包含 emails 数组");
  }

  return snapshot as MembersSnapshot;
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
