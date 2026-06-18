import { expect, type Page } from "@playwright/test";
import type { OperatorRegistry } from "../../_framework/types";
import { clearBrowserState } from "../../_operators/common.helpers";
import { requiredString } from "../../_operators/params";
import type { SystemMembersStatusCaseData, TestContext } from "./_support/members-status.context";
import { setDefaultLandingPathByEmail } from "./_support/members-status.helpers";

type ConfirmSnapshot = {
  accepted: boolean;
  action: string;
  dismissed: boolean;
  message: string;
};

export const systemMembersStatusOperators = {
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
  "page.members_list": {
    contains_user: async ({ ctx, params }) => {
      const row = memberRow(ctx.page, requiredString(params, "email"));
      await expect(row).toBeVisible();
      await expect(row).toContainText(requiredString(params, "name"));
    },
  },
  "page.member_row_status": {
    text: async ({ ctx, params }) => {
      await expect(memberStatus(ctx.page, requiredString(params, "email"))).toHaveText(requiredString(params, "text"));
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
      const dialogPromise = ctx.page.waitForEvent("dialog");

      await rowAction(ctx.page, params).click();
      const dialog = await dialogPromise;
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
    },
  },
  "page.confirm_snapshot": {
    observe: async ({ params }) => {
      expect(confirmSnapshot(params).message.trim().length).toBeGreaterThan(0);
    },
    dismissed: async ({ params }) => {
      const snapshot = confirmSnapshot(params);
      expect(snapshot.dismissed).toBe(true);
      expect(snapshot.accepted).toBe(false);
    },
    accepted: async ({ ctx, params }) => {
      const snapshot = confirmSnapshot(params);
      expect(snapshot.accepted).toBe(true);
      expect(snapshot.dismissed).toBe(false);
      const waitEmail = requiredString(params, "waitEmail");
      const waitStatus = requiredString(params, "waitStatus");
      await expect(memberStatus(ctx.page, waitEmail)).toHaveText(waitStatus);
    },
    message_matches: async ({ params }) => {
      const pattern = new RegExp(requiredString(params, "pattern"));
      expect(confirmSnapshot(params).message).toMatch(pattern);
    },
    contains: async ({ params }) => {
      expect(confirmSnapshot(params).message).toContain(requiredString(params, "text"));
    },
  },
  "page.login_form": {
    submit_failure: async ({ ctx }) => {
      const responsePromise = ctx.page
        .waitForResponse((response) => {
          return response.request().method().toUpperCase() === "POST" && response.url().endsWith("/api/auth/login");
        }, { timeout: 5_000 })
        .then(async (response) => ({
          status: response.status(),
          ok: response.ok(),
          url: response.url(),
          body: await response.json().catch(() => null),
        }))
        .catch(() => null);

      await ctx.page.getByRole("button", { name: "Sign In" }).click();
      return await responsePromise;
    },
  },
  "page.login_error": {
    visible: async ({ ctx }) => {
      await expect(
        ctx.page.getByText(/账号已停用|你的账号已停用|账号或密码错误|Invalid credentials|credentials are invalid|不可用/),
      ).toBeVisible();
    },
  },
} satisfies OperatorRegistry<TestContext, SystemMembersStatusCaseData>;

function membersTable(page: Page) {
  return page.locator("table.orf-user-table");
}

function memberRow(page: Page, email: string) {
  return membersTable(page).locator("tbody tr", { hasText: email });
}

function memberStatus(page: Page, email: string) {
  return memberRow(page, email).locator(".orf-user-status");
}

function rowAction(page: Page, params: Record<string, unknown>) {
  return memberRow(page, requiredString(params, "email")).getByRole("button", {
    name: requiredString(params, "action"),
    exact: true,
  });
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
