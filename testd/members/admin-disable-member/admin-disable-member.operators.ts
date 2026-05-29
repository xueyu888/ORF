import { expect } from "@playwright/test";
import type { OperatorRegistry } from "../../_framework/types";
import { readBrowserSession } from "../../_operators/common.helpers";
import { optionalString, requiredString } from "../../_operators/params";
import { captureUserDisableResponse } from "../admin-edit-member/_support/admin-edit-member.helpers";
import type { AdminDisableMemberCaseData, TestContext } from "./_support/admin-disable-member.context";

export const adminDisableMemberOperators = {
  "page.admin_disable_member_login": {
    submit_admin: async ({ ctx, data }) => {
      await ctx.page.getByRole("button", { name: "Sign In" }).click();
      await expect
        .poll(() => readBrowserSession(ctx.page))
        .toMatchObject({
          status: 200,
          body: {
            authenticated: true,
            user: {
              email: data.adminEmail,
              role: data.adminRole,
              status: "active",
            },
          },
        });
    },
  },

  "page.member_row": {
    visible: async ({ ctx, params }) => {
      await expect(memberRow(ctx, requiredString(params, "text"))).toBeVisible();
    },

    status_visible: async ({ ctx, params }) => {
      await expect(memberRow(ctx, requiredString(params, "text")).getByText(requiredString(params, "statusText"), { exact: true })).toBeVisible();
    },

    disable_visible: async ({ ctx, params }) => {
      await expect(memberRow(ctx, requiredString(params, "text")).getByRole("button", { name: "停用" })).toBeVisible();
    },

    disable: async ({ ctx, runtime, params }) => {
      const saveAs = optionalString(params, "saveAs");
      const userId = requiredString(params, "userId");
      if (saveAs) {
        runtime.values[saveAs] = captureUserDisableResponse(ctx.page, userId);
      }
      ctx.page.once("dialog", (dialog) => void dialog.accept());
      await memberRow(ctx, requiredString(params, "text")).getByRole("button", { name: "停用" }).click();
    },
  },
} satisfies OperatorRegistry<TestContext, AdminDisableMemberCaseData>;

function memberRow(ctx: TestContext, text: string) {
  return ctx.page.locator(".orf-user-table").getByRole("row").filter({ hasText: text });
}
