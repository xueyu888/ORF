import { expect, type Page } from "@playwright/test";
import type { OperatorRegistry } from "../../_framework/types";
import { clearBrowserState } from "../../_operators/common.helpers";
import { requiredString } from "../../_operators/params";
import type { PersonalSettingsToastNotificationCaseData, TestContext } from "./_support/personal-settings-toast-notification.context";
import {
  readToastEnabledByEmail,
  setDefaultLandingPathByEmail,
  setToastEnabledByEmail,
} from "./_support/personal-settings-toast-notification.helpers";

type ToastSnapshot = {
  messages: string[];
  pageUrl: string;
  savedToastEnabled?: boolean | null;
  toastVisible: boolean;
};

export const personalSettingsToastNotificationOperators = {
  browser: {
    clear_state: async ({ ctx }) => {
      await ctx.context.clearCookies();
      await clearBrowserState(ctx.page);
      await installClientBridgeMocks(ctx.page);
    },
  },
  "user.preferences": {
    reset_default_landing_path_by_email: async ({ params }) => {
      await setDefaultLandingPathByEmail(requiredString(params, "email"), null);
    },
    set_toast_enabled_by_email: async ({ params }) => {
      await setToastEnabledByEmail(requiredString(params, "email"), requiredBoolean(params, "enabled"));
    },
    toast_enabled_is: async ({ params }) => {
      await expect.poll(() => readToastEnabledByEmail(requiredString(params, "email"))).toBe(requiredBoolean(params, "enabled"));
    },
  },
  "personal_settings.page": {
    visible: async ({ ctx, params }) => {
      await expect(ctx.page).toHaveURL(new RegExp(requiredString(params, "pattern")));
      await expect(ctx.page.getByRole("heading", { name: "个人设置", exact: true })).toBeVisible();
    },
  },
  "personal_settings.toast": {
    visible: async ({ ctx }) => {
      await expect(toastSetting(ctx.page)).toBeVisible();
    },
    checked: async ({ ctx, params }) => {
      await expect(toastToggle(ctx.page)).toBeChecked({ checked: requiredBoolean(params, "enabled") });
    },
    enabled: async ({ ctx }) => {
      await expect(toastToggle(ctx.page)).toBeEnabled();
    },
    set_checked: async ({ ctx, params }) => {
      const enabled = requiredBoolean(params, "enabled");
      const email = requiredString(params, "email");
      await closeVisibleToasts(ctx.page);
      if ((await toastToggle(ctx.page).isChecked()) !== enabled) {
        await toastToggle(ctx.page).click();
      }
      await expect(toastToggle(ctx.page)).toBeChecked({ checked: enabled });
      await expect.poll(() => readToastEnabledByEmail(email)).toBe(enabled);
      return {
        messages: await currentToastMessages(ctx.page),
        pageUrl: ctx.page.url(),
        savedToastEnabled: await readToastEnabledByEmail(email),
        toastVisible: await toastCard(ctx.page).first().isVisible().catch(() => false),
      } satisfies ToastSnapshot;
    },
  },
  "personal_settings.system_notification_test": {
    visible: async ({ ctx }) => {
      await expect(systemNotificationTestButton(ctx.page)).toBeVisible();
    },
    enabled: async ({ ctx }) => {
      await expect(systemNotificationTestButton(ctx.page)).toBeEnabled();
    },
    click: async ({ ctx, params }) => {
      const message = requiredString(params, "message");
      const email = requiredString(params, "email");
      const before = await currentToastMessages(ctx.page);
      await systemNotificationTestButton(ctx.page).click();
      await expect(systemNotificationTestButton(ctx.page)).toBeEnabled();
      const shouldShowToast = await toastToggle(ctx.page).isChecked();
      if (shouldShowToast) {
        await expect(toastCard(ctx.page).filter({ hasText: message }).first()).toBeVisible();
      } else {
        await expect.poll(async () => {
          const after = await currentToastMessages(ctx.page);
          return after.filter((item) => !before.includes(item) && item.includes(message)).length;
        }).toBe(0);
      }
      const messages = await currentToastMessages(ctx.page);
      return {
        messages,
        pageUrl: ctx.page.url(),
        savedToastEnabled: await readToastEnabledByEmail(email),
        toastVisible: messages.some((item) => item.includes(message)),
      } satisfies ToastSnapshot;
    },
  },
  toast_snapshot: {
    visible: async ({ params }) => {
      expect(requiredToastSnapshot(params, "snapshot").toastVisible).toBe(true);
    },
    hidden: async ({ params }) => {
      expect(requiredToastSnapshot(params, "snapshot").toastVisible).toBe(false);
    },
    contains: async ({ params }) => {
      const snapshot = requiredToastSnapshot(params, "snapshot");
      const message = requiredString(params, "message");
      expect(snapshot.messages.some((item) => item.includes(message))).toBe(true);
    },
    saved_preference: async ({ params }) => {
      const snapshot = requiredToastSnapshot(params, "snapshot");
      expect(snapshot.savedToastEnabled).toBe(requiredBoolean(params, "enabled"));
    },
  },
} satisfies OperatorRegistry<TestContext, PersonalSettingsToastNotificationCaseData>;

function toastSetting(page: Page) {
  return page.locator("label").filter({ hasText: "Toast 通知" }).first();
}

function toastToggle(page: Page) {
  return toastSetting(page).locator('input[type="checkbox"]');
}

function systemNotificationTestButton(page: Page) {
  return page
    .locator("div")
    .filter({ hasText: /^系统通知Windows \/ Android 客户端测试$/ })
    .getByRole("button", { name: "测试", exact: true })
    .first();
}

function toastCard(page: Page) {
  return page.locator(".orf-toast-card");
}

async function currentToastMessages(page: Page) {
  return toastCard(page).locator(".flex-1").allTextContents();
}

async function closeVisibleToasts(page: Page) {
  const closeButtons = toastCard(page).getByRole("button", { name: "关闭提示" });
  const count = await closeButtons.count();
  for (let index = 0; index < count; index += 1) {
    await closeButtons.nth(index).click().catch(() => undefined);
  }
  await expect(toastCard(page)).toHaveCount(0);
}

function requiredBoolean(params: Record<string, unknown>, key: string) {
  const value = params[key];
  if (typeof value === "boolean") {
    return value;
  }
  throw new Error(`参数 ${key} 必须是布尔值`);
}

function requiredToastSnapshot(params: Record<string, unknown>, key: string): ToastSnapshot {
  const value = params[key];
  if (!value || typeof value !== "object") {
    throw new Error(`参数 ${key} 必须是 Toast 快照`);
  }
  return value as ToastSnapshot;
}

async function installClientBridgeMocks(page: Page) {
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
    window.orfNativeNotifications = {
      onOpenChatTarget: () => () => undefined,
      showChatMessage: async () => ({ status: "success" }),
    };
  });
}
