import { expect, type Page } from "@playwright/test";
import type { OperatorRegistry } from "../../_framework/types";
import { clearBrowserState } from "../../_operators/common.helpers";
import { requiredNumber, requiredString } from "../../_operators/params";
import type { SystemMembersDeleteCaseData, TestContext } from "./_support/members-delete.context";
import { readUsersTotal, setDefaultLandingPathByEmail } from "./_support/members-delete.helpers";

type ConfirmSnapshot = {
  accepted: boolean;
  action: string;
  dismissed: boolean;
  message: string;
};

export const systemMembersDeleteOperators = {
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
  "db.users_total": {
    record: async () => readUsersTotal(),
  },
  "page.members_list": {
    contains_user: async ({ ctx, params }) => {
      const row = memberRow(ctx.page, requiredString(params, "email"));
      await expect(row).toBeVisible();
      await expect(row).toContainText(requiredString(params, "name"));
    },
    not_contains_user: async ({ ctx, params }) => {
      await expect(memberRow(ctx.page, requiredString(params, "email"))).toBeHidden();
    },
  },
  "page.members_total": {
    equals: async ({ ctx, params }) => {
      const expected = requiredNumber(params, "expected");
      if ("actual" in params) {
        expect(requiredNumber(params, "actual")).toBe(expected);
        return;
      }
      await expect.poll(() => readPageUsersTotal(ctx.page)).toBe(expected);
    },
    decreased_by: async ({ ctx, params }) => {
      const baseline = requiredNumber(params, "baseline");
      const delta = requiredNumber(params, "delta");
      await expect.poll(() => readPageUsersTotal(ctx.page)).toBe(baseline - delta);
    },
  },
  "page.member_row_action": {
    visible: async ({ ctx, params }) => {
      await expect(rowAction(ctx.page, params)).toBeVisible();
    },
    enabled: async ({ ctx, params }) => {
      await expect(rowAction(ctx.page, params)).toBeEnabled();
    },
    click_confirm: async ({ ctx, params }) => {
      const action = requiredString(params, "action");
      const decision = requiredString(params, "decision");
      const dialogPromise = ctx.page.waitForEvent("dialog", { timeout: 5_000 }).then(async (dialog) => {
        const snapshot: ConfirmSnapshot = {
          accepted: decision === "accept",
          action,
          dismissed: decision === "dismiss",
          message: dialog.message(),
        };

        if (decision === "accept") {
          await dialog.accept();
        } else if (decision === "dismiss") {
          await dialog.dismiss();
        } else {
          throw new Error(`不支持的确认框处理方式: ${decision}`);
        }

        return snapshot;
      });

      await rowAction(ctx.page, params).click();
      return await dialogPromise;
    },
  },
  "page.confirm_snapshot": {
    observe: async ({ params }) => {
      expect(confirmSnapshot(params).message.trim().length).toBeGreaterThan(0);
    },
    dismissed: async ({ ctx, params }) => {
      const snapshot = confirmSnapshot(params);
      expect(snapshot.dismissed).toBe(true);
      expect(snapshot.accepted).toBe(false);
      if (typeof params.saveAs === "string") {
        return await readPageUsersTotal(ctx.page);
      }
    },
    accepted: async ({ ctx, params }) => {
      const snapshot = confirmSnapshot(params);
      expect(snapshot.accepted).toBe(true);
      expect(snapshot.dismissed).toBe(false);
      await expect(memberRow(ctx.page, requiredString(params, "waitEmail"))).toBeHidden();
    },
    message_matches: async ({ params }) => {
      const pattern = new RegExp(requiredString(params, "pattern"));
      expect(confirmSnapshot(params).message).toMatch(pattern);
    },
    contains: async ({ params }) => {
      expect(confirmSnapshot(params).message).toContain(requiredString(params, "text"));
    },
  },
} satisfies OperatorRegistry<TestContext, SystemMembersDeleteCaseData>;

function membersTable(page: Page) {
  return page.locator("table.orf-user-table");
}

function memberRow(page: Page, email: string) {
  return membersTable(page).locator("tbody tr", { hasText: email });
}

function rowAction(page: Page, params: Record<string, unknown>) {
  return memberRow(page, requiredString(params, "email")).getByRole("button", {
    name: requiredString(params, "action"),
    exact: true,
  });
}

async function readPageUsersTotal(page: Page) {
  const text = await page.locator(".orf-permission-metrics").getByText(/用户/).textContent();
  const match = text?.match(/(\d+)\s*用户/);
  if (!match) {
    throw new Error(`无法读取成员管理页面用户总数: ${text ?? "<empty>"}`);
  }
  return Number(match[1]);
}

function confirmSnapshot(params: Record<string, unknown>): ConfirmSnapshot {
  const snapshot = params.snapshot;
  if (!snapshot || typeof snapshot !== "object" || !("message" in snapshot)) {
    throw new Error("参数 snapshot 必须包含确认弹窗快照");
  }

  return snapshot as ConfirmSnapshot;
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
