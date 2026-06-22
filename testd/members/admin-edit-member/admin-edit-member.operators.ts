import { expect } from "@playwright/test";
import type { OperatorRegistry } from "../../_framework/types";
import { readBrowserSession } from "../../_operators/common.helpers";
import { optionalString, requiredString } from "../../_operators/params";
import type { AdminEditMemberCaseData, TestContext } from "./_support/admin-edit-member.context";
import { captureUserUpdateResponse } from "./_support/admin-edit-member.helpers";

export const adminEditMemberOperators = {
  "api.user_update": {
    capture: async ({ ctx, runtime, params }) => {
      runtime.values[requiredString(params, "saveAs")] = captureUserUpdateResponse(ctx.page, requiredString(params, "userId"));
    },
  },

  "page.admin_edit_login": {
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

    absent: async ({ ctx, params }) => {
      await expect(memberRow(ctx, requiredString(params, "text"))).toHaveCount(0);
    },

    edit_visible: async ({ ctx, params }) => {
      await expect(memberRow(ctx, requiredString(params, "text")).getByRole("button", { name: "编辑用户", exact: true })).toBeVisible();
    },

    edit: async ({ ctx, params }) => {
      await memberRow(ctx, requiredString(params, "text")).getByRole("button", { name: "编辑用户", exact: true }).click();
    },
  },

  "page.member_dialog": {
    visible: async ({ ctx }) => {
      await expect(memberDialog(ctx)).toBeVisible();
    },

    fill_name: async ({ ctx, params }) => {
      await memberDialog(ctx).getByLabel("姓名").fill(requiredString(params, "value"));
    },

    fill_email: async ({ ctx, params }) => {
      await memberDialog(ctx).getByLabel("邮箱").fill(requiredString(params, "value"));
    },

    select_role: async ({ ctx, params }) => {
      await memberDialog(ctx).getByLabel("角色").selectOption(requiredString(params, "role"));
    },

    submit: async ({ ctx, runtime, params }) => {
      const saveAs = optionalString(params, "saveAs");
      const userId = optionalString(params, "userId");
      if (saveAs && userId) {
        runtime.values[saveAs] = captureUserUpdateResponse(ctx.page, userId);
      }
      await memberDialog(ctx).getByRole("button", { name: "保存" }).click();
    },
  },
} satisfies OperatorRegistry<TestContext, AdminEditMemberCaseData>;

function memberRow(ctx: TestContext, text: string) {
  return ctx.page.locator(".orf-user-table").getByRole("row").filter({ hasText: text });
}

function memberDialog(ctx: TestContext) {
  return ctx.page.getByRole("dialog", { name: "编辑用户" });
}
