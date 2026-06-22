import { expect, type Page } from "@playwright/test";
import type { OperatorRegistry } from "../../_framework/types";
import { clearBrowserState, readBrowserSession } from "../../_operators/common.helpers";
import { requiredString } from "../../_operators/params";
import type { TestContext, UserMenuActionsCaseData } from "./_support/user-menu-actions.context";
import { deleteAvatarByEmail, setDefaultLandingPathByEmail, uploadAvatarByEmail } from "./_support/user-menu-actions.helpers";

type VisibilitySnapshot = {
  name?: string;
  visible: boolean;
};

type UserMenuSnapshot = {
  items: Record<string, boolean>;
  visible: boolean;
};

type PersonalSettingsSnapshot = {
  titleVisible: boolean;
  url: string;
};

type LogoutSnapshot = {
  authPageVisible: boolean;
  unauthenticated: boolean;
};

export const userMenuActionsOperators = {
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

  "user.avatar": {
    upload_by_email: async ({ params }) => {
      await uploadAvatarByEmail(requiredString(params, "email"));
    },
    ensure_absent_by_email: async ({ params }) => {
      await deleteAvatarByEmail(requiredString(params, "email"));
    },
    delete_by_email: async ({ params }) => {
      await deleteAvatarByEmail(requiredString(params, "email"));
    },
  },

  "sidebar.current_user_avatar": {
    visible: async ({ ctx }) => {
      await expect(sidebarUserButton(ctx.page).locator("div[title]").first()).toBeVisible();
    },
  },

  "sidebar.current_user_name": {
    text: async ({ ctx, params }) => {
      await expect(sidebar(ctx.page).locator(".orf-sidebar-user-name")).toHaveText(requiredString(params, "name"));
    },
  },

  "sidebar.user_menu": {
    visible: async ({ ctx }) => {
      await expect(sidebarUserButton(ctx.page)).toBeVisible();
    },
    enabled: async ({ ctx }) => {
      await expect(sidebarUserButton(ctx.page)).toBeEnabled();
    },
    click: async ({ ctx }) => {
      await sidebarUserButton(ctx.page).click();
      await expect(userMenu(ctx.page)).toBeVisible();
      return userMenuSnapshot(ctx.page);
    },
  },

  "user_menu": {
    visible: async ({ ctx, params }) => {
      const snapshot = optionalUserMenuSnapshot(params);
      if (snapshot) {
        expect(snapshot.visible).toBe(true);
        return;
      }
      await expect(userMenu(ctx.page)).toBeVisible();
    },
  },

  "user_menu.item": {
    visible: async ({ ctx, params }) => {
      const snapshot = optionalUserMenuSnapshot(params);
      const name = requiredString(params, "name");
      if (snapshot) {
        expect(snapshot.items[name]).toBe(true);
        return;
      }
      await ensureUserMenuOpen(ctx.page);
      await expect(menuItem(ctx.page, name)).toBeVisible();
    },
    hidden: async ({ ctx, params }) => {
      const snapshot = optionalUserMenuSnapshot(params);
      const name = requiredString(params, "name");
      if (snapshot) {
        expect(snapshot.items[name]).toBe(false);
        return;
      }
      await ensureUserMenuOpen(ctx.page);
      await expect(menuItem(ctx.page, name)).toHaveCount(0);
    },
  },

  "page.user_menu_item": {
    visible: async ({ ctx, params }) => {
      await ensureUserMenuOpen(ctx.page);
      await expect(menuItem(ctx.page, requiredString(params, "name"))).toBeVisible();
    },
    click: async ({ ctx, params }) => {
      const name = requiredString(params, "name");
      await ensureUserMenuOpen(ctx.page);
      await menuItem(ctx.page, name).click();

      if (name === "查看头像") {
        const dialog = ctx.page.locator(".orf-image-preview-dialog");
        await expect(dialog).toBeVisible();
        return { visible: await dialog.isVisible() } satisfies VisibilitySnapshot;
      }

      if (name === "个人设置") {
        await expect(ctx.page).toHaveURL(/\/settings$/);
        const heading = ctx.page.getByRole("heading", { name: "个人设置", exact: true });
        await expect(heading).toBeVisible();
        return {
          titleVisible: await heading.isVisible(),
          url: ctx.page.url(),
        } satisfies PersonalSettingsSnapshot;
      }

      if (name === "关于与更新") {
        const dialog = ctx.page.getByRole("dialog", { name: /版本与更新/ });
        await expect(dialog).toBeVisible();
        return { name: "版本与更新", visible: await dialog.isVisible() } satisfies VisibilitySnapshot;
      }

      if (name === "退出登录") {
        await expect(ctx.page.getByRole("button", { name: "Sign In" })).toBeVisible();
        const unauthenticated = await readBrowserSessionAuthenticated(ctx.page) === false;
        return {
          authPageVisible: await ctx.page.getByRole("button", { name: "Sign In" }).isVisible(),
          unauthenticated,
        } satisfies LogoutSnapshot;
      }
    },
  },

  "avatar_preview": {
    visible: async ({ ctx, params }) => {
      const snapshot = optionalVisibilitySnapshot(params);
      if (snapshot) {
        expect(snapshot.visible).toBe(true);
        return;
      }
      await expect(ctx.page.locator(".orf-image-preview-dialog")).toBeVisible();
    },
    close: async ({ ctx }) => {
      await ctx.page.getByRole("button", { name: "关闭图片预览" }).click();
      await expect(ctx.page.locator(".orf-image-preview-dialog")).toHaveCount(0);
    },
    hidden: async ({ ctx }) => {
      await expect(ctx.page.locator(".orf-image-preview-dialog")).toHaveCount(0);
    },
  },

  "about_update_dialog": {
    visible: async ({ ctx, params }) => {
      const snapshot = optionalVisibilitySnapshot(params);
      if (snapshot) {
        expect(snapshot.visible).toBe(true);
        return;
      }
      await expect(ctx.page.getByRole("dialog", { name: /版本与更新/ })).toBeVisible();
    },
    close: async ({ ctx }) => {
      await ctx.page.getByRole("button", { name: "关闭版本与更新" }).click();
      await expect(ctx.page.getByRole("dialog", { name: /版本与更新/ })).toHaveCount(0);
    },
    hidden: async ({ ctx }) => {
      await expect(ctx.page.getByRole("dialog", { name: /版本与更新/ })).toHaveCount(0);
    },
  },

  "personal_settings_snapshot": {
    url: async ({ params }) => {
      expect(requiredPersonalSettingsSnapshot(params).url).toMatch(/\/settings$/);
    },
    title_visible: async ({ params }) => {
      expect(requiredPersonalSettingsSnapshot(params).titleVisible).toBe(true);
    },
  },

  "logout_snapshot": {
    session_unauthenticated: async ({ params }) => {
      expect(requiredLogoutSnapshot(params).unauthenticated).toBe(true);
    },
    auth_page_visible: async ({ params }) => {
      expect(requiredLogoutSnapshot(params).authPageVisible).toBe(true);
    },
  },
} satisfies OperatorRegistry<TestContext, UserMenuActionsCaseData>;

function sidebar(page: Page) {
  return page.locator("aside.orf-sidebar[aria-label='主导航']");
}

function sidebarUserButton(page: Page) {
  return sidebar(page).getByRole("button", { name: "用户菜单", exact: true });
}

function userMenu(page: Page) {
  return page.getByRole("menu", { name: "用户菜单" });
}

function menuItem(page: Page, name: string) {
  return page.getByRole("menuitem", { name, exact: true });
}

async function ensureUserMenuOpen(page: Page) {
  if (!(await userMenu(page).isVisible().catch(() => false))) {
    await sidebarUserButton(page).click();
  }
  await expect(userMenu(page)).toBeVisible();
}

async function userMenuSnapshot(page: Page): Promise<UserMenuSnapshot> {
  const items: Record<string, boolean> = {};
  for (const name of ["查看头像", "个人设置", "关于与更新", "退出登录"]) {
    items[name] = await menuItem(page, name).isVisible().catch(() => false);
  }
  return {
    items,
    visible: await userMenu(page).isVisible(),
  };
}

async function readBrowserSessionAuthenticated(page: Page) {
  return (await readBrowserSession(page)).body.authenticated === true;
}

function optionalVisibilitySnapshot(params: Record<string, unknown>): VisibilitySnapshot | undefined {
  const snapshot = params.snapshot;
  if (snapshot === undefined || snapshot === null) {
    return undefined;
  }
  if (typeof snapshot === "object" && typeof (snapshot as VisibilitySnapshot).visible === "boolean") {
    return snapshot as VisibilitySnapshot;
  }
  throw new Error("参数 snapshot 必须包含 visible");
}

function optionalUserMenuSnapshot(params: Record<string, unknown>): UserMenuSnapshot | undefined {
  const snapshot = params.snapshot;
  if (snapshot === undefined || snapshot === null) {
    return undefined;
  }
  if (
    typeof snapshot === "object" &&
    typeof (snapshot as UserMenuSnapshot).visible === "boolean" &&
    typeof (snapshot as UserMenuSnapshot).items === "object" &&
    (snapshot as UserMenuSnapshot).items !== null
  ) {
    return snapshot as UserMenuSnapshot;
  }
  throw new Error("参数 snapshot 必须包含 visible 和 items");
}

function requiredPersonalSettingsSnapshot(params: Record<string, unknown>): PersonalSettingsSnapshot {
  const snapshot = params.snapshot;
  if (
    typeof snapshot === "object" &&
    snapshot !== null &&
    typeof (snapshot as PersonalSettingsSnapshot).titleVisible === "boolean" &&
    typeof (snapshot as PersonalSettingsSnapshot).url === "string"
  ) {
    return snapshot as PersonalSettingsSnapshot;
  }
  throw new Error("参数 snapshot 必须包含 url 和 titleVisible");
}

function requiredLogoutSnapshot(params: Record<string, unknown>): LogoutSnapshot {
  const snapshot = params.snapshot;
  if (
    typeof snapshot === "object" &&
    snapshot !== null &&
    typeof (snapshot as LogoutSnapshot).authPageVisible === "boolean" &&
    typeof (snapshot as LogoutSnapshot).unauthenticated === "boolean"
  ) {
    return snapshot as LogoutSnapshot;
  }
  throw new Error("参数 snapshot 必须包含 authPageVisible 和 unauthenticated");
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
