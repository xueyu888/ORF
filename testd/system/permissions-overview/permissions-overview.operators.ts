import { expect, type Page } from "@playwright/test";
import { permissionDefinitions } from "../../../src/config/permissions";
import type { OperatorRegistry } from "../../_framework/types";
import { clearBrowserState } from "../../_operators/common.helpers";
import { requiredString } from "../../_operators/params";
import type {
  SystemPermissionsOverviewCaseData,
  SystemPermissionsOverviewPermissionData,
  TestContext,
} from "./_support/permissions-overview.context";
import { setDefaultLandingPathByEmail } from "./_support/permissions-overview.helpers";

export const systemPermissionsOverviewOperators = {
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
  "api.permission_definitions": {
    read: async () => permissionDefinitions,
    contains: async ({ params }) => {
      const definitions = requiredSourcePermissionDefinitions(params.definitions);
      const permission = requiredPermission(params.permission);
      expect(definitions).toContainEqual(expect.objectContaining({
        key: permission.permissionKey,
        category: permission.category,
        label: permission.label,
        location: permission.location,
      }));
    },
  },
  "page.permissions_title": {
    visible: async ({ ctx }) => {
      await expect(permissionsTitle(ctx.page)).toBeVisible();
    },
  },
  "page.permissions_page": {
    observe: async ({ ctx }) => {
      await expect(ctx.page).toHaveURL(/\/system\/permissions$/);
      await expect(permissionsTitle(ctx.page)).toBeVisible();
      await expect(permissionTable(ctx.page)).toBeVisible();
    },
  },
  "page.permissions_role_switch": {
    visible: async ({ ctx }) => {
      await expect(roleTabs(ctx.page)).toBeVisible();
    },
    contains_role: async ({ ctx, params }) => {
      await expect(roleTabs(ctx.page).getByRole("button").filter({ hasText: requiredString(params, "label") })).toBeVisible();
    },
  },
  "page.permissions_list": {
    visible: async ({ ctx }) => {
      await expect(permissionTable(ctx.page)).toBeVisible();
    },
  },
  "page.permissions_list_header": {
    contains: async ({ ctx, params }) => {
      await expect(permissionTable(ctx.page).locator("thead")).toContainText(requiredString(params, "text"));
    },
    contains_allowed_status: async ({ ctx }) => {
      await expect(permissionTable(ctx.page).locator("thead")).toContainText("允许");
    },
  },
  "page.permission_row": {
    visible: async ({ ctx, params }) => {
      await expect(permissionRow(ctx.page, requiredPermission(params.permission).permissionKey)).toBeVisible();
    },
    category: async ({ ctx, params }) => {
      const permission = requiredPermission(params.permission);
      await expect(permissionRow(ctx.page, permission.permissionKey)).toContainText(permission.category);
    },
    label: async ({ ctx, params }) => {
      const permission = requiredPermission(params.permission);
      await expect(permissionRow(ctx.page, permission.permissionKey)).toContainText(permission.label);
    },
    location: async ({ ctx, params }) => {
      const permission = requiredPermission(params.permission);
      await expect(permissionRow(ctx.page, permission.permissionKey)).toContainText(permission.location);
    },
    allowed_state_visible: async ({ ctx, params }) => {
      const permission = requiredPermission(params.permission);
      const row = permissionRow(ctx.page, permission.permissionKey);
      await expect(row.locator(".orf-permission-toggle")).toBeVisible();
      await expect(row.locator(".orf-permission-toggle input")).toBeAttached();
    },
  },
  "page.permissions_save_button": {
    visible: async ({ ctx }) => {
      await expect(saveButton(ctx.page)).toBeVisible();
    },
    disabled: async ({ ctx }) => {
      await expect(saveButton(ctx.page)).toBeVisible();
      await expect(saveButton(ctx.page)).toBeDisabled();
    },
  },
} satisfies OperatorRegistry<TestContext, SystemPermissionsOverviewCaseData>;

function permissionsTitle(page: Page) {
  return page.locator(".orf-topbar-title").filter({ hasText: "权限管理" });
}

function roleTabs(page: Page) {
  return page.locator(".orf-role-tabs");
}

function permissionTable(page: Page) {
  return page.locator("table.orf-role-permission-table");
}

function permissionRow(page: Page, permissionKey: string) {
  return permissionTable(page).locator("tbody tr", { hasText: permissionKey }).first();
}

function saveButton(page: Page) {
  return page.getByRole("button", { name: "保存角色权限" });
}

function requiredPermission(value: unknown): SystemPermissionsOverviewPermissionData {
  if (typeof value !== "object" || value === null) {
    throw new Error("参数 permission 必须是权限定义对象");
  }

  const permission = value as Partial<SystemPermissionsOverviewPermissionData>;
  if (
    typeof permission.permissionKey !== "string" ||
    typeof permission.category !== "string" ||
    typeof permission.label !== "string" ||
    typeof permission.location !== "string"
  ) {
    throw new Error("权限定义对象必须包含 permissionKey、category、label、location");
  }

  return permission as SystemPermissionsOverviewPermissionData;
}

function requiredSourcePermissionDefinitions(value: unknown): readonly { key: string; category: string; label: string; location: string }[] {
  if (!Array.isArray(value)) {
    throw new Error("参数 definitions 必须是权限定义列表");
  }
  return value.map((item) => {
    if (typeof item !== "object" || item === null) {
      throw new Error("系统权限定义必须是对象");
    }
    const definition = item as { key?: unknown; category?: unknown; label?: unknown; location?: unknown };
    if (
      typeof definition.key !== "string" ||
      typeof definition.category !== "string" ||
      typeof definition.label !== "string" ||
      typeof definition.location !== "string"
    ) {
      throw new Error("系统权限定义必须包含 key、category、label、location");
    }
    return definition as { key: string; category: string; label: string; location: string };
  });
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
