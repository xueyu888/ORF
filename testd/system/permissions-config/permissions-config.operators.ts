import { expect, type Page } from "@playwright/test";
import { permissionKeys, type PermissionKey } from "../../../src/config/permissions";
import type { PermissionRule, UserRole } from "../../../src/types/orf";
import type { OperatorRegistry, StepParams } from "../../_framework/types";
import { clearBrowserState, readResponseBody } from "../../_operators/common.helpers";
import { requiredNumber, requiredString } from "../../_operators/params";
import type {
  CurrentAccessResult,
  PermissionRulesResult,
  SystemPermissionsConfigCaseData,
  TestContext,
} from "./_support/permissions-config.context";
import {
  readCurrentAccessAsUser,
  readPermissionRulesByTeamId,
  readPermissionRulesAsCurrentUser,
  rolePermissionKeys,
  setDefaultLandingPathByEmail,
  systemPermissionKeys,
  toggleRolePermission,
  updateMemberPermissionRulesByTeamId,
  updateMemberPermissionRules,
} from "./_support/permissions-config.helpers";

export const systemPermissionsConfigOperators = {
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
  "api.permissions": {
    read_member_rules: async ({ ctx, params }) => {
      if (typeof params.teamId === "string") {
        return readPermissionRulesByTeamId(params.teamId);
      }

      const result = await readPermissionRulesAsCurrentUser(ctx.page);
      expect(result.status).toBe(200);
      return requiredPermissionRules(result.body.permissionRules);
    },
    count_member_rules: async ({ params }) => {
      return rolePermissionKeys(requiredPermissionRules(params.rules), "member").length;
    },
    recorded: async ({ params }) => {
      expect(requiredPermissionRules(params.rules).some((rule) => rule.role === "member")).toBe(true);
    },
    restore_member: async ({ ctx, params }) => {
      if (params.rules === undefined || params.rules === null) {
        return undefined;
      }

      if (typeof params.teamId === "string") {
        return await updateMemberPermissionRulesByTeamId(params.teamId, requiredPermissionRules(params.rules));
      }

      return await updateMemberPermissionRules(ctx.page, requiredPermissionRules(params.rules));
    },
    response_ok: async ({ params }) => {
      const result = requiredPermissionRulesResult(params.result);
      expect(result.status).toBe(200);
    },
    member_rules_equal: async ({ params }) => {
      const actual = rolePermissionKeys(requiredPermissionRules(params.actualRules), requiredRole(params, "role"));
      const expected = rolePermissionKeys(requiredPermissionRules(params.expectedRules), requiredRole(params, "role"));
      expect(actual).toEqual(expected);
    },
  },
  "api.user_access": {
    matches_rules: async ({ ctx, params }) => {
      const result = await readCurrentAccessAsUser(
        ctx.page,
        requiredString(params, "email"),
        requiredString(params, "password"),
      );
      expectAccessPermissions(result).toEqual(
        sortedPermissionKeys(rolePermissionKeys(requiredPermissionRules(params.rules), requiredRole(params, "role"))),
      );
    },
    includes_all_permissions: async ({ ctx, params }) => {
      const result = await readCurrentAccessAsUser(
        ctx.page,
        requiredString(params, "email"),
        requiredString(params, "password"),
      );
      expectAccessPermissions(result).toEqual(sortedPermissionKeys(systemPermissionKeys()));
    },
  },
  "page.role_tab": {
    visible: async ({ ctx, params }) => {
      await expect(roleTab(ctx.page, requiredString(params, "text"))).toBeVisible();
    },
    click: async ({ ctx, params }) => {
      const text = requiredString(params, "text");
      await roleTab(ctx.page, text).click();
      await expect(roleTab(ctx.page, text)).toHaveClass(/orf-role-tab-active/);
    },
  },
  "page.permission_toggle": {
    visible: async ({ ctx, params }) => {
      await expect(permissionToggle(ctx.page, requiredString(params, "permissionKey"))).toBeVisible();
    },
    toggle: async ({ ctx, params }) => {
      const permissionKey = requiredPermissionKey(params, "permissionKey");
      await permissionToggle(ctx.page, permissionKey).click();
      await expect(saveButton(ctx.page)).toBeEnabled();
      return toggleRolePermission(
        requiredPermissionRules(params.originalRules),
        requiredRole(params, "role"),
        permissionKey,
      );
    },
    readonly_allowed: async ({ ctx, params }) => {
      await roleTab(ctx.page, "管理员").click();
      const toggle = permissionToggle(ctx.page, requiredString(params, "permissionKey"));
      await expect(toggle).toBeVisible();
      const input = permissionRow(ctx.page, requiredString(params, "permissionKey")).locator(".orf-permission-toggle input");
      await expect(input).toBeChecked();
      await expect(input).toBeDisabled();
    },
  },
  "page.permissions_count": {
    record: async ({ ctx }) => readSelectedRoleCount(ctx.page),
    equals: async ({ params }) => {
      expect(requiredNumber(params, "actual")).toBe(requiredNumber(params, "expected"));
    },
    equals_system_total: async ({ params }) => {
      expect(requiredNumber(params, "actual")).toBe(permissionKeys.length);
    },
    equals_rules_count: async ({ ctx, params }) => {
      await roleTab(ctx.page, "成员").click();
      await expect.poll(() => readSelectedRoleCount(ctx.page)).toBe(
        rolePermissionKeys(requiredPermissionRules(params.rules), requiredRole(params, "role")).length,
      );
    },
  },
  "page.permissions_role_rules": {
    shows_member_rules: async ({ ctx, params }) => {
      await roleTab(ctx.page, "成员").click();
      await expect.poll(() => readSelectedRoleCount(ctx.page)).toBe(
        rolePermissionKeys(requiredPermissionRules(params.rules), "member").length,
      );
    },
    shows_admin_rules: async ({ ctx }) => {
      await roleTab(ctx.page, "管理员").click();
      await expect.poll(() => readSelectedRoleCount(ctx.page)).toBe(permissionKeys.length);
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

      await expect(saveButton(ctx.page)).toBeEnabled();
      await saveButton(ctx.page).click();
      const result = await responsePromise;
      await expect(saveButton(ctx.page)).toBeDisabled();
      return result;
    },
  },
} satisfies OperatorRegistry<TestContext, SystemPermissionsConfigCaseData>;

function roleTab(page: Page, text: string) {
  return page.locator(".orf-role-tabs").getByRole("button").filter({ hasText: text }).first();
}

function permissionTable(page: Page) {
  return page.locator("table.orf-role-permission-table");
}

function permissionRow(page: Page, permissionKey: string) {
  return permissionTable(page).locator("tbody tr", { hasText: permissionKey }).first();
}

function permissionToggle(page: Page, permissionKey: string) {
  return permissionRow(page, permissionKey).locator(".orf-permission-toggle");
}

function saveButton(page: Page) {
  return page.getByRole("button", { name: "保存角色权限" });
}

async function readSelectedRoleCount(page: Page) {
  const text = await page.locator(".orf-permission-metrics strong").textContent();
  const match = text?.match(/(\d+)/);
  if (!match) {
    throw new Error(`无法读取当前角色已允许权限数量: ${text ?? "<empty>"}`);
  }
  return Number(match[1]);
}

function requiredPermissionRules(value: unknown): PermissionRule[] {
  if (!Array.isArray(value)) {
    throw new Error("参数必须是权限规则数组");
  }

  return value.map((rule) => {
    if (
      typeof rule !== "object" ||
      rule === null ||
      typeof (rule as PermissionRule).role !== "string" ||
      !Array.isArray((rule as PermissionRule).permissions)
    ) {
      throw new Error("权限规则结构不正确");
    }
    return rule as PermissionRule;
  });
}

function requiredPermissionRulesResult(value: unknown): PermissionRulesResult {
  if (typeof value !== "object" || value === null || typeof (value as PermissionRulesResult).status !== "number") {
    throw new Error("参数 result 必须是权限接口响应");
  }
  return value as PermissionRulesResult;
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

function expectAccessPermissions(result: CurrentAccessResult) {
  expect(result.status).toBe(200);
  if (!Array.isArray(result.body.permissions)) {
    throw new Error("当前用户权限范围响应必须包含 permissions 数组");
  }
  return expect([...result.body.permissions].sort());
}

function sortedPermissionKeys(keys: readonly PermissionKey[]) {
  return [...keys].sort();
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
