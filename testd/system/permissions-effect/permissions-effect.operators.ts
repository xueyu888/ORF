import { expect, type Page } from "@playwright/test";
import type { PermissionKey } from "../../../src/config/permissions";
import type { PermissionRule, UserRole } from "../../../src/types/orf";
import type { OperatorRegistry, StepParams } from "../../_framework/types";
import { clearBrowserState, readResponseBody } from "../../_operators/common.helpers";
import { requiredString } from "../../_operators/params";
import {
  commentMessageRow,
  commentPanel,
  createRootFixtureComment,
  openCommentPanel,
  removeTestComments,
  rootCommentPersisted,
} from "../../comments/_support/comment.helpers";
import type {
  CommentManageActionState,
  CurrentAccessResult,
  PermissionRulesResult,
  PermissionSwitchState,
  PreparedCommentTarget,
  SystemPermissionsEffectCaseData,
  TestContext,
} from "./_support/permissions-effect.context";
import {
  prepareCommentObjective,
  readCurrentAccess,
  readPermissionRulesByTeamId,
  rolePermissionKeys,
  setDefaultLandingPathByEmail,
  setRolePermission,
  updateMemberPermissionRulesByTeamId,
} from "./_support/permissions-effect.helpers";

export const systemPermissionsEffectOperators = {
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
  "db.comment_objective": {
    prepare: async ({ params }) => {
      const objective = await prepareCommentObjective({
        authorName: requiredString(params, "authorName"),
        authorUserId: requiredString(params, "authorUserId"),
        id: requiredString(params, "id"),
        memberName: requiredString(params, "memberName"),
        memberUserId: requiredString(params, "memberUserId"),
        teamId: requiredString(params, "teamId"),
        title: requiredString(params, "title"),
      });
      return {
        type: "objective",
        id: objective.id,
        title: objective.title,
        objectiveId: objective.id,
      } satisfies PreparedCommentTarget;
    },
  },
  "db.comment": {
    create_root: async ({ params }) =>
      createRootFixtureComment({
        actorEmail: requiredString(params, "actorEmail"),
        actorName: requiredString(params, "actorName"),
        body: requiredString(params, "body"),
        marker: requiredString(params, "marker"),
        target: requiredCommentTarget(params, "target"),
      }),
    root_persisted: async ({ params }) => {
      await expect
        .poll(() =>
          rootCommentPersisted({
            authorEmail: requiredString(params, "authorEmail"),
            body: requiredString(params, "body"),
            target: requiredCommentTarget(params, "target"),
          }),
        )
        .toBe(true);
    },
  },
  "db.test_comments": {
    delete: async ({ params }) => {
      await removeTestComments({
        actorEmail: requiredString(params, "actorEmail"),
        marker: requiredString(params, "marker"),
      });
    },
  },
  "api.permissions": {
    read_member_rules: async ({ params }) =>
      readPermissionRulesByTeamId(requiredString(params, "teamId")),
    recorded: async ({ params }) => {
      expect(requiredPermissionRules(params.rules).some((rule) => rule.role === "member")).toBe(true);
    },
    restore_member: async ({ params }) => {
      if (params.rules === undefined || params.rules === null) {
        return undefined;
      }
      return updateMemberPermissionRulesByTeamId(
        requiredString(params, "teamId"),
        requiredPermissionRules(params.rules),
      );
    },
    includes: async ({ params }) => {
      expect(rolePermissionKeys(requiredPermissionRules(params.rules), requiredRole(params, "role"))).toContain(
        requiredPermissionKey(params, "permissionKey"),
      );
    },
    excludes: async ({ params }) => {
      expect(rolePermissionKeys(requiredPermissionRules(params.rules), requiredRole(params, "role"))).not.toContain(
        requiredPermissionKey(params, "permissionKey"),
      );
    },
  },
  "api.current_access": {
    read: async ({ ctx }) => readCurrentAccess(ctx.page),
    includes: async ({ params }) => {
      expectAccessPermissions(requiredCurrentAccess(params.access)).toContain(requiredPermissionKey(params, "permissionKey"));
    },
    excludes: async ({ params }) => {
      expectAccessPermissions(requiredCurrentAccess(params.access)).not.toContain(requiredPermissionKey(params, "permissionKey"));
    },
  },
  "page.role_tab": {
    click: async ({ ctx, params }) => {
      const text = requiredString(params, "text");
      await roleTab(ctx.page, text).click();
      await expect(roleTab(ctx.page, text)).toHaveClass(/orf-role-tab-active/);
    },
    selected: async ({ ctx, params }) => {
      await expect(roleTab(ctx.page, requiredString(params, "text"))).toHaveClass(/orf-role-tab-active/);
    },
  },
  "page.permission_toggle": {
    visible: async ({ ctx, params }) => {
      await expect(permissionToggle(ctx.page, requiredString(params, "permissionKey"))).toBeVisible();
    },
    set: async ({ ctx, params }) => {
      const permissionKey = requiredPermissionKey(params, "permissionKey");
      const checked = requiredBoolean(params, "checked");
      const input = permissionInput(ctx.page, permissionKey);
      await expect(input).toBeVisible();

      const wasChecked = await input.isChecked();
      if (wasChecked !== checked) {
        await permissionToggle(ctx.page, permissionKey).click();
        await expect(saveButton(ctx.page)).toBeEnabled();
      }

      await expect(input).toBeChecked({ checked });
      return setRolePermission(
        requiredPermissionRules(params.originalRules),
        requiredRole(params, "role"),
        permissionKey,
        checked,
      );
    },
    record_state: async ({ ctx, params }) => {
      const input = permissionInput(ctx.page, requiredString(params, "permissionKey"));
      await expect(input).toBeVisible();
      return { checked: await input.isChecked() } satisfies PermissionSwitchState;
    },
  },
  "page.permission_switch_state": {
    unchecked: async ({ params }) => {
      expect(requiredPermissionSwitchState(params.state).checked).toBe(false);
    },
  },
  "page.permissions_save": {
    submit: async ({ ctx }) => {
      if (await saveButton(ctx.page).isDisabled()) {
        return {
          status: 200,
          body: { ok: true, skipped: "unchanged" },
        } satisfies PermissionRulesResult;
      }

      const responsePromise = ctx.page
        .waitForResponse((response) => {
          return response.request().method().toUpperCase() === "PUT" && response.url().endsWith("/api/permissions/member");
        })
        .then(async (response) => ({
          status: response.status(),
          body: await readResponseBody(response),
        } satisfies PermissionRulesResult));

      await expect(saveButton(ctx.page)).toBeEnabled();
      await saveButton(ctx.page).click();
      const result = await responsePromise;
      await expect(saveButton(ctx.page)).toBeDisabled();
      expect(result.status).toBe(200);
      return result;
    },
  },
  "page.comment_target": {
    open: async ({ ctx, params }) => {
      await ctx.page.goto(requiredString(params, "path"));
      await openCommentPanel(ctx.page, requiredCommentTarget(params, "target"));
      await expect(commentPanel(ctx.page)).toBeVisible();
    },
  },
  "page.comment_manage_actions": {
    record: async ({ ctx, params }) => {
      const row = commentMessageRow(ctx.page, requiredString(params, "body"));
      await expect(row).toBeVisible();
      return {
        editVisible: await row.getByRole("button", { name: "编辑评论" }).isVisible().catch(() => false),
        deleteVisible: await row.getByRole("button", { name: "删除评论" }).isVisible().catch(() => false),
      } satisfies CommentManageActionState;
    },
  },
  "page.comment_manage_actions_state": {
    unavailable: async ({ params }) => {
      const state = requiredCommentManageActionState(params.state);
      expect(state.editVisible).toBe(false);
      expect(state.deleteVisible).toBe(false);
    },
    available: async ({ params }) => {
      const state = requiredCommentManageActionState(params.state);
      expect(state.editVisible || state.deleteVisible).toBe(true);
    },
  },
} satisfies OperatorRegistry<TestContext, SystemPermissionsEffectCaseData>;

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

function permissionInput(page: Page, permissionKey: string) {
  return permissionRow(page, permissionKey).locator(".orf-permission-toggle input");
}

function saveButton(page: Page) {
  return page.getByRole("button", { name: "保存角色权限" });
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

function requiredRole(params: StepParams, key: string): "member" {
  const value = requiredString(params, key);
  if (value !== "member") {
    throw new Error(`参数 ${key} 必须是 member`);
  }
  return value;
}

function requiredPermissionKey(params: StepParams, key: string): PermissionKey {
  return requiredString(params, key) as PermissionKey;
}

function requiredBoolean(params: StepParams, key: string): boolean {
  const value = params[key];
  if (typeof value !== "boolean") {
    throw new Error(`参数 ${key} 必须是 boolean`);
  }
  return value;
}

function requiredCommentTarget(params: StepParams, key: string): PreparedCommentTarget {
  const value = params[key];
  if (
    typeof value !== "object" ||
    value === null ||
    (value as PreparedCommentTarget).type !== "objective" ||
    typeof (value as PreparedCommentTarget).id !== "string" ||
    typeof (value as PreparedCommentTarget).title !== "string" ||
    typeof (value as PreparedCommentTarget).objectiveId !== "string"
  ) {
    throw new Error(`参数 ${key} 必须是目标评论对象`);
  }
  return value as PreparedCommentTarget;
}

function requiredPermissionSwitchState(value: unknown): PermissionSwitchState {
  if (typeof value !== "object" || value === null || typeof (value as PermissionSwitchState).checked !== "boolean") {
    throw new Error("权限开关状态必须包含 checked");
  }
  return value as PermissionSwitchState;
}

function requiredCommentManageActionState(value: unknown): CommentManageActionState {
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as CommentManageActionState).editVisible !== "boolean" ||
    typeof (value as CommentManageActionState).deleteVisible !== "boolean"
  ) {
    throw new Error("评论管理操作状态必须包含 editVisible 和 deleteVisible");
  }
  return value as CommentManageActionState;
}

function requiredCurrentAccess(value: unknown): CurrentAccessResult {
  if (typeof value !== "object" || value === null || typeof (value as CurrentAccessResult).status !== "number") {
    throw new Error("当前权限范围响应结构不正确");
  }
  return value as CurrentAccessResult;
}

function expectAccessPermissions(result: CurrentAccessResult) {
  expect(result.status).toBe(200);
  if (!Array.isArray(result.body.permissions)) {
    throw new Error("当前用户权限范围响应必须包含 permissions 数组");
  }
  return expect([...result.body.permissions].sort());
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
