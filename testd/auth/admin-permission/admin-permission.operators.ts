import { expect } from "@playwright/test";
import type { OperatorRegistry, StepParams } from "../../_framework/types";
import { requiredString } from "../../_operators/params";
import type { AdminPermissionCaseData, TestContext } from "./_support/admin-permission.context";
import {
  memberPermissionKeys,
  readPermissionRulesAsCurrentUser,
  toggleRolePermission,
  updateMemberPermissionRules,
} from "./_support/admin-permission.helpers";
import type { PermissionRule, UserRole } from "../../../src/types/orf";
import type { PermissionKey } from "../../../src/config/permissions";

export const adminPermissionOperators = {
  "api.permissions": {
    read: async ({ ctx }) => {
      const result = await readPermissionRulesAsCurrentUser(ctx.page);
      expect(result.status).toBe(200);
      return requiredPermissionRules(result.body.permissionRules);
    },

    recorded: async ({ params }) => {
      expect(requiredPermissionRules(params.rules).length).toBeGreaterThan(0);
    },

    changed_member_rules: async ({ params }) => {
      return toggleRolePermission(
        requiredPermissionRules(params.originalRules),
        requiredRole(params, "role"),
        requiredPermissionKey(params, "permissionKey"),
      );
    },

    update_member: async ({ ctx, params }) => {
      return updateMemberPermissionRules(ctx.page, requiredPermissionRules(params.rules));
    },

    restore_member: async ({ ctx, params }) => {
      if (params.rules === undefined || params.rules === null) {
        return undefined;
      }
      return updateMemberPermissionRules(ctx.page, requiredPermissionRules(params.rules));
    },

    response_ok: async ({ params }) => {
      const result = params.result;
      if (!isPermissionRulesResult(result)) {
        throw new Error("参数 result 必须是权限接口响应");
      }
      expect(result.status).toBe(200);
    },

    member_rules_match: async ({ ctx, params }) => {
      const expected = memberPermissionKeys(
        requiredPermissionRules(params.expectedRules),
        requiredRole(params, "role"),
      );
      await expect.poll(async () => {
        const result = await readPermissionRulesAsCurrentUser(ctx.page);
        return memberPermissionKeys(requiredPermissionRules(result.body.permissionRules), requiredRole(params, "role"));
      }).toEqual(expected);
    },
  },

  "page.role_tab": {
    visible: async ({ ctx, params }) => {
      await expect(ctx.page.locator(".orf-role-tabs").getByRole("button").filter({ hasText: requiredString(params, "text") }).first()).toBeVisible();
    },
  },
} satisfies OperatorRegistry<TestContext, AdminPermissionCaseData>;

function requiredPermissionRules(value: unknown): PermissionRule[] {
  if (!Array.isArray(value)) {
    throw new Error("参数必须是权限规则数组");
  }
  return value.map((rule) => {
    if (typeof rule !== "object" || rule === null || typeof (rule as PermissionRule).role !== "string" || !Array.isArray((rule as PermissionRule).permissions)) {
      throw new Error("权限规则结构不正确");
    }
    return rule as PermissionRule;
  });
}

function requiredRole(params: StepParams, key: string): UserRole {
  const value = requiredString(params, key);
  if (value !== "member" && value !== "admin") {
    throw new Error(`参数 ${key} 必须是 member 或 admin`);
  }
  return value;
}

function requiredPermissionKey(params: StepParams, key: string): PermissionKey {
  return requiredString(params, key) as PermissionKey;
}

function isPermissionRulesResult(value: unknown): value is { status: number } {
  return typeof value === "object" && value !== null && typeof (value as { status?: unknown }).status === "number";
}
