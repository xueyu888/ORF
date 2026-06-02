import { expect } from "@playwright/test";
import type { OperatorRegistry, StepParams } from "../../_framework/types";
import { readBrowserSession, readResponseBody } from "../../_operators/common.helpers";
import { requiredString } from "../../_operators/params";
import {
  acquireRolePermissionLock,
  releaseRolePermissionLock,
} from "../../_operators/role-permission-lock";
import type { AdminPermissionCaseData, TestContext } from "./_support/admin-permission.context";
import {
  memberPermissionKeys,
  readPermissionRulesAsCurrentUser,
  toggleRolePermission,
  updateMemberPermissionRules,
} from "./_support/admin-permission.helpers";
import type { PermissionRule, UserRole } from "../../../src/types/orf";
import type { PermissionKey } from "../../../src/config/permissions";

const rolePermissionLockOwnerKey = "__testdRolePermissionLockOwner";

export const adminPermissionOperators = {
  "page.admin_permission_login": {
    submit_admin: async ({ ctx, data }) => {
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

  "api.permissions": {
    read: async ({ ctx }) => {
      const lockOwner = await acquireRolePermissionLock();
      try {
        const result = await readPermissionRulesAsCurrentUser(ctx.page);
        expect(result.status).toBe(200);
        return attachRolePermissionLockOwner(requiredPermissionRules(result.body.permissionRules), lockOwner);
      } catch (error) {
        await releaseRolePermissionLock(lockOwner);
        throw error;
      }
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
      const lockOwner = rolePermissionLockOwner(params.rules);
      try {
        return await updateMemberPermissionRules(ctx.page, requiredPermissionRules(params.rules));
      } finally {
        await releaseRolePermissionLock(lockOwner);
      }
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
      await expect(roleTab(ctx, requiredString(params, "text"))).toBeVisible();
    },

    click: async ({ ctx, params }) => {
      await roleTab(ctx, requiredString(params, "text")).click();
    },
  },

  "page.permission_toggle": {
    visible: async ({ ctx, params }) => {
      await expect(permissionRow(ctx, requiredString(params, "permissionKey")).locator(".orf-permission-toggle")).toBeVisible();
    },

    toggle: async ({ ctx, params }) => {
      await permissionRow(ctx, requiredString(params, "permissionKey")).locator(".orf-permission-toggle").click();
      return toggleRolePermission(
        requiredPermissionRules(params.originalRules),
        requiredRole(params, "role"),
        requiredPermissionKey(params, "permissionKey"),
      );
    },
  },

  "page.permissions_save": {
    submit: async ({ ctx }) => {
      const responsePromise = ctx.page
        .waitForResponse((response) => {
          return response.request().method().toUpperCase() === "PUT" && response.url().endsWith("/api/permissions/member");
        })
        .then(async (response) => ({
          status: response.status(),
          body: await readResponseBody(response),
        }));

      await expect(ctx.page.getByRole("button", { name: "保存角色权限" })).toBeEnabled();
      await ctx.page.getByRole("button", { name: "保存角色权限" }).click();
      return responsePromise;
    },
  },
} satisfies OperatorRegistry<TestContext, AdminPermissionCaseData>;

function roleTab(ctx: TestContext, text: string) {
  return ctx.page.locator(".orf-role-tabs").getByRole("button").filter({ hasText: text }).first();
}

function permissionRow(ctx: TestContext, permissionKey: string) {
  return ctx.page.locator(".orf-role-permission-table tbody tr").filter({ hasText: permissionKey }).first();
}

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

function attachRolePermissionLockOwner(rules: PermissionRule[], lockOwner: string): PermissionRule[] {
  Object.defineProperty(rules, rolePermissionLockOwnerKey, {
    configurable: true,
    enumerable: false,
    value: lockOwner,
  });
  return rules;
}

function rolePermissionLockOwner(value: unknown): string | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const owner = (value as Record<string, unknown>)[rolePermissionLockOwnerKey];
  return typeof owner === "string" ? owner : undefined;
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
