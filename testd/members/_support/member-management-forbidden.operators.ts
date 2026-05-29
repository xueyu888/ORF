import { expect } from "@playwright/test";
import type { OperatorRegistry } from "../../_framework/types";
import { readBrowserSession } from "../../_operators/common.helpers";
import type {
  MemberManagementForbiddenCaseData,
  MemberManagementForbiddenTestContext,
} from "./member-management-forbidden.context";

export const memberManagementForbiddenOperators = {
  "page.member_management_forbidden_login": {
    submit_member: async ({ ctx, data }) => {
      await ctx.page.getByRole("button", { name: "Sign In" }).click();
      await expect
        .poll(() => readBrowserSession(ctx.page))
        .toMatchObject({
          status: 200,
          body: {
            authenticated: true,
            user: {
              email: data.memberEmail,
              role: data.memberRole,
              status: "active",
            },
          },
        });
    },
  },

  "page.member_management": {
    absent: async ({ ctx }) => {
      await expect(ctx.page.locator(".orf-user-table")).toHaveCount(0);
    },

    edit_action_absent: async ({ ctx }) => {
      await expect(ctx.page.locator(".orf-user-table").getByRole("button", { name: "编辑" })).toHaveCount(0);
    },

    disable_action_absent: async ({ ctx }) => {
      await expect(ctx.page.locator(".orf-user-table").getByRole("button", { name: "停用" })).toHaveCount(0);
    },

    delete_action_absent: async ({ ctx }) => {
      await expect(ctx.page.locator(".orf-user-table").getByRole("button", { name: "删除" })).toHaveCount(0);
    },
  },
} satisfies OperatorRegistry<MemberManagementForbiddenTestContext, MemberManagementForbiddenCaseData>;
