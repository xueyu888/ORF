import { expect } from "@playwright/test";
import type { OperatorRegistry } from "../../_framework/types";
import { requiredString } from "../../_operators/params";
import type { AdminEditMemberCaseData, TestContext } from "./_support/admin-edit-member.context";
import { captureUserUpdateResponse } from "./_support/admin-edit-member.helpers";

export const adminEditMemberOperators = {
  "api.user_update": {
    capture: async ({ ctx, runtime, params }) => {
      runtime.values[requiredString(params, "saveAs")] = captureUserUpdateResponse(ctx.page, requiredString(params, "userId"));
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
      await expect(memberRow(ctx, requiredString(params, "text")).getByRole("button", { name: "编辑" })).toBeVisible();
    },

    edit: async ({ ctx, params }) => {
      await memberRow(ctx, requiredString(params, "text")).getByRole("button", { name: "编辑" }).click();
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

    submit: async ({ ctx }) => {
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
