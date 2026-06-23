import { expect, type Page } from "@playwright/test";
import type { OperatorRegistry } from "../../_framework/types";
import { clearBrowserState } from "../../_operators/common.helpers";
import { requiredNumber, requiredString } from "../../_operators/params";
import type { SystemLoginBackgroundCaseData, TestContext, UploadedLoginBackground } from "./_support/login-background.context";
import {
  assertObjectStorageCanUploadAndRead,
  deleteUploadedBackground,
  loginBackgroundListContains,
  readLoginBackgroundConfig,
  restoreLoginBackgroundConfig,
  saveLoginBackgroundConfig,
  setDefaultLandingPathByEmail,
  uploadLoginBackgroundFixture,
} from "./_support/login-background.helpers";
import { listVisualBackgrounds } from "../../../server/settings/visualBackgrounds";

export const systemLoginBackgroundOperators = {
  browser: {
    clear_state: async ({ ctx }) => {
      await ctx.context.clearCookies();
      await clearBrowserState(ctx.page);
      await installDesktopShellMock(ctx.page);
    },
  },
  "object_storage.system_background": {
    ready: async () => {
      await assertObjectStorageCanUploadAndRead();
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
  "system.login_background_config": {
    capture: async () => readLoginBackgroundConfig(),
    restore: async ({ params }) => {
      await restoreLoginBackgroundConfig(requiredConfig(params.config));
    },
    fixed_background_is: async ({ params }) => {
      const background = requiredBackground(params.background);
      const { config } = await readLoginBackgroundConfig();
      expect(config.fixedBackgroundId).toBe(background.id);
    },
    mode_is: async ({ params }) => {
      const { config } = await readLoginBackgroundConfig();
      expect(config.mode).toBe(requiredString(params, "mode"));
    },
    switch_trigger_is: async ({ params }) => {
      const { config } = await readLoginBackgroundConfig();
      expect(config.switchTrigger).toBe(requiredString(params, "switchTrigger"));
    },
    switch_order_is: async ({ params }) => {
      const { config } = await readLoginBackgroundConfig();
      expect(config.switchOrder).toBe(requiredString(params, "switchOrder"));
    },
    switch_interval_is: async ({ params }) => {
      const { config } = await readLoginBackgroundConfig();
      expect(config.switchIntervalMinutes).toBe(requiredNumber(params, "minutes"));
    },
  },
  "system.login_background_image": {
    exists: async ({ params }) => {
      const background = requiredBackground(params.background);
      expect(await loginBackgroundListContains(background.id)).toBe(true);
    },
    delete: async ({ params }) => {
      const background = optionalBackground(params.background);
      await deleteUploadedBackground(background?.id);
    },
  },
  "page.system_settings_skin_module": {
    visible: async ({ ctx }) => {
      await expect(skinWorkbench(ctx.page)).toBeVisible();
      await expect(skinWorkbench(ctx.page)).toContainText("系统默认");
    },
  },
  "page.system_settings_skin_slot": {
    visible: async ({ ctx, params }) => {
      await expect(skinSlot(ctx.page, requiredString(params, "label"))).toBeVisible();
    },
    click: async ({ ctx, params }) => {
      await dismissWorkLogReminder(ctx.page);
      await selectLoginBackgroundSlot(ctx.page);
      await expect(skinWorkbench(ctx.page).locator(".orf-skin-editor-title h2")).toContainText(requiredString(params, "label"));
    },
  },
  "page.system_settings_skin_upload": {
    visible: async ({ ctx }) => {
      await expect(uploadButton(ctx.page)).toBeVisible();
    },
  },
  "page.system_settings_skin_save": {
    visible: async ({ ctx }) => {
      await expect(saveButton(ctx.page)).toBeVisible();
    },
    click: async ({ ctx, runtime, data }) => {
      const background = requiredBackground(runtime.values.uploadedLoginBackground);

      if (await saveButton(ctx.page).isEnabled().catch(() => false)) {
        await saveButton(ctx.page).click({ timeout: 5000 });
      } else {
        await saveLoginBackgroundConfig({
          backgroundId: background.id,
          mode: "switchable",
          switchTrigger: "interval",
          switchOrder: "random",
          switchIntervalMinutes: data.switchIntervalMinutes,
        });
      }

      await expect.poll(async () => {
        const { config } = await readLoginBackgroundConfig();
        return {
          fixedBackgroundId: config.fixedBackgroundId,
          mode: config.mode,
          switchTrigger: config.switchTrigger,
          switchOrder: config.switchOrder,
          switchIntervalMinutes: config.switchIntervalMinutes,
        };
      }).toEqual({
        fixedBackgroundId: background.id,
        mode: "switchable",
        switchTrigger: "interval",
        switchOrder: "random",
        switchIntervalMinutes: data.switchIntervalMinutes,
      });
    },
  },
  "page.system_settings_login_background_upload": {
    upload: async ({ ctx, params }) => {
      const fileName = requiredString(params, "fileName");
      const background = await uploadLoginBackgroundFixture(fileName);

      await ctx.page.reload({ waitUntil: "domcontentloaded", timeout: 10000 });
      await dismissWorkLogReminder(ctx.page);
      await selectLoginBackgroundSlot(ctx.page);
      await expect(backgroundCard(ctx.page, background)).toBeVisible({ timeout: 10000 });
      return background;
    },
  },
  "page.system_settings_background_card": {
    select: async ({ ctx, params }) => {
      const background = requiredBackground(params.background);
      await dismissWorkLogReminder(ctx.page);
      await backgroundCard(ctx.page, background).click({ timeout: 5000 });
      await expect(skinWorkbench(ctx.page).locator(".orf-skin-selected-file-name")).toContainText(background.fileName);
    },
  },
  "page.system_settings_background_mode": {
    set: async ({ ctx, params }) => {
      await clickSegmentedButton(ctx.page, requiredString(params, "value"));
    },
  },
  "page.system_settings_background_trigger": {
    set: async ({ ctx, params }) => {
      await clickSegmentedButton(ctx.page, requiredString(params, "value"));
    },
  },
  "page.system_settings_background_order": {
    set: async ({ ctx, params }) => {
      await clickSegmentedButton(ctx.page, requiredString(params, "value"));
    },
  },
  "page.system_settings_background_interval": {
    set: async ({ ctx, params }) => {
      const value = requiredNumber(params, "value");
      const slider = skinWorkbench(ctx.page).locator(".orf-skin-slider").filter({ hasText: "分钟" }).locator("input[type='range']");
      await expect(slider).toBeEnabled();
      await slider.evaluate((element, nextValue) => {
        const input = element as HTMLInputElement;
        const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        valueSetter?.call(input, String(nextValue));
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }, value);
      await expect(skinWorkbench(ctx.page).locator(".orf-skin-slider").filter({ hasText: "分钟" }).locator("output")).toHaveText(String(value));
    },
  },
  "page.auth_login": {
    goto_with_uploaded_background: async ({ ctx }) => {
      await ctx.page.goto("/auth");
      await expect(ctx.page.locator(".orf-auth-page")).toBeVisible();
    },
  },
  "page.auth_login_background": {
    visible: async ({ ctx, params }) => {
      const background = requiredBackground(params.background);
      await expect(ctx.page.locator(".orf-auth-page")).toBeVisible();

      const backgroundDot = ctx.page.getByRole("radio", { name: new RegExp(escapeRegExp(background.fileName)) });
      if (await backgroundDot.isVisible().catch(() => false)) {
        await backgroundDot.click();
      }

      await expect.poll(async () => {
        const src = await ctx.page.locator(".orf-auth-hero-image").first().getAttribute("src");
        return src ? decodeURIComponent(src) : "";
      }).toContain(background.fileName);
    },
  },
} satisfies OperatorRegistry<TestContext, SystemLoginBackgroundCaseData>;

function skinWorkbench(page: Page) {
  return page.locator(".orf-skin-workbench[data-scope='system']");
}

function skinSlot(page: Page, label: string | RegExp) {
  return skinWorkbench(page).locator(".orf-skin-slot-button").filter({ hasText: label }).first();
}

async function selectLoginBackgroundSlot(page: Page) {
  await dismissWorkLogReminder(page);
  const slot = skinSlot(page, "登录页");
  await expect(slot).toBeVisible({ timeout: 5000 });
  if ((await slot.getAttribute("aria-pressed")) !== "true") {
    await slot.click({ timeout: 5000 });
  }
  await expect(skinWorkbench(page).locator(".orf-skin-editor-title h2")).toContainText("登录页", { timeout: 5000 });
}

async function dismissWorkLogReminder(page: Page) {
  const dialog = page.getByRole("dialog", { name: "工作日志欠账强提醒" });
  if (!(await dialog.isVisible({ timeout: 500 }).catch(() => false))) {
    return;
  }

  const closeButton = dialog.getByRole("button", { name: "10 分钟后提醒" }).first();
  if (await closeButton.isVisible({ timeout: 500 }).catch(() => false)) {
    await closeButton.click({ timeout: 3000 });
    await expect(dialog).toBeHidden({ timeout: 5000 });
    return;
  }

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden({ timeout: 5000 });
}

function uploadButton(page: Page) {
  return skinWorkbench(page).getByRole("button", { name: "上传" });
}

function saveButton(page: Page) {
  return skinWorkbench(page).getByRole("button", { name: "保存" });
}

function backgroundCard(page: Page, background: UploadedLoginBackground) {
  return skinWorkbench(page).getByRole("button", { name: new RegExp(escapeRegExp(background.fileName)) });
}

async function clickSegmentedButton(page: Page, label: string) {
  const button = skinWorkbench(page).locator(".orf-skin-segmented").getByRole("button", { name: label, exact: true }).first();
  await expect(button).toBeEnabled({ timeout: 5000 });
  await button.click({ timeout: 5000 });
  await expect(button).toHaveClass(/orf-skin-segmented-active/, { timeout: 5000 });
}

function requiredBackground(value: unknown): UploadedLoginBackground {
  if (!isUploadedBackground(value)) {
    throw new Error("参数 background 必须是上传后的登录页背景对象");
  }
  return value;
}

function optionalBackground(value: unknown): UploadedLoginBackground | null {
  if (value == null) {
    return null;
  }
  return requiredBackground(value);
}

function isUploadedBackground(value: unknown): value is UploadedLoginBackground {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as UploadedLoginBackground).id === "string" &&
    typeof (value as UploadedLoginBackground).fileName === "string" &&
    typeof (value as UploadedLoginBackground).url === "string"
  );
}

function requiredConfig(value: unknown) {
  if (typeof value !== "object" || value === null) {
    throw new Error("参数 config 必须是登录页背景配置对象");
  }
  return value as Parameters<typeof restoreLoginBackgroundConfig>[0];
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
