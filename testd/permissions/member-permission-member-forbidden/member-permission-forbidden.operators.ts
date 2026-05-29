import { expect } from "@playwright/test";
import { getPermissionRulesForScope } from "../../../server/repositories/permissionRepository";
import { runtimeScope } from "../../../server/repositories/runtimeScope";
import type { OperatorRegistry } from "../../_framework/types";
import { readBrowserSession } from "../../_operators/common.helpers";
import { requiredString } from "../../_operators/params";
import type {
  MemberPermissionForbiddenCaseData,
  MemberPermissionSnapshot,
  TestContext,
} from "./_support/member-permission-forbidden.context";

export const memberPermissionForbiddenOperators = {
  "page.member_permission_forbidden_login": {
    submit_member: async ({ ctx, data }) => {
      await ctx.page.getByRole("button", { name: "Sign In" }).click();
      await expect
        .poll(() => readBrowserSession(ctx.page))
        .toMatchObject({
          status: 200,
          body: {
            authenticated: true,
            user: {
              email: data.email,
              role: data.role,
              status: "active",
            },
          },
        });
    },
  },

  "db.member_permissions": {
    read: async ({ params }) => {
      return {
        permissionRules: await getPermissionRulesForScope(runtimeScope(requiredString(params, "teamId"))),
      } satisfies MemberPermissionSnapshot;
    },

    recorded: async ({ params }) => {
      expect(requiredSnapshot(params.snapshot).permissionRules.length).toBeGreaterThan(0);
    },

    matches_snapshot: async ({ params }) => {
      const snapshot = requiredSnapshot(params.snapshot);
      await expect
        .poll(async () => await getPermissionRulesForScope(runtimeScope(requiredString(params, "teamId"))))
        .toEqual(snapshot.permissionRules);
    },
  },

  "page.permission_management": {
    absent: async ({ ctx }) => {
      await expect(ctx.page.locator(".orf-role-permission-table")).toHaveCount(0);
    },

    save_action_absent: async ({ ctx }) => {
      await expect(ctx.page.getByRole("button", { name: "保存角色权限" })).toHaveCount(0);
    },
  },
} satisfies OperatorRegistry<TestContext, MemberPermissionForbiddenCaseData>;

function requiredSnapshot(value: unknown): MemberPermissionSnapshot {
  if (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as MemberPermissionSnapshot).permissionRules)
  ) {
    return value as MemberPermissionSnapshot;
  }

  throw new Error("参数 snapshot 必须是 member 权限快照");
}
