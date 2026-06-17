import { expect, type Page } from "@playwright/test";
import type { OperatorRegistry } from "../../_framework/types";
import { clearBrowserState } from "../../_operators/common.helpers";
import { requiredString } from "../../_operators/params";
import type { PersonalSettingsSystemSkinCaseData, TestContext } from "./_support/personal-settings-system-skin.context";
import {
  listAppSystemBackgrounds,
  readAppBackgroundByEmail,
  readDefaultAppBackground,
  setAppBackgroundByEmail,
  setDefaultLandingPathByEmail,
  systemBackgroundFileExists,
} from "./_support/personal-settings-system-skin.helpers";
import type { VisualBackgroundConfig, VisualBackgroundImage } from "../../../src/state/apiClient";

type SystemSkinSnapshot = {
  pageUrl: string;
  savedAppBackground: VisualBackgroundConfig | null;
  selectedBackground: VisualBackgroundImage | null;
  shellBackgroundImage: string | null;
  sidebarImageSrc: string | null;
};

export const personalSettingsSystemSkinOperators = {
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
    reset_app_background_by_email: async ({ params }) => {
      await setAppBackgroundByEmail(requiredString(params, "email"), null);
    },
    app_background_is_default: async ({ params }) => {
      await expect.poll(() => readAppBackgroundByEmail(requiredString(params, "email"))).toBeNull();
    },
  },
  "personal_settings.page": {
    visible: async ({ ctx, params }) => {
      await expect(ctx.page).toHaveURL(new RegExp(requiredString(params, "pattern")));
      await expect(ctx.page.getByRole("heading", { name: "个人设置", exact: true })).toBeVisible();
    },
  },
  "personal_settings.skin_list": {
    visible: async ({ ctx }) => {
      await expect(settingsBackgroundGallery(ctx.page)).toBeVisible();
    },
    contains_system_skin: async ({ ctx }) => {
      const background = await pickSystemBackground();
      await expect(systemSkinCard(ctx.page, background)).toBeVisible();
    },
  },
  "personal_settings.system_skin_card": {
    selectable: async ({ ctx }) => {
      const background = await pickSystemBackground();
      await expect(systemSkinCard(ctx.page, background)).toBeVisible();
      await expect(systemSkinCard(ctx.page, background)).toBeEnabled();
    },
    select: async ({ ctx }) => {
      const background = await pickSystemBackground();
      await systemSkinCard(ctx.page, background).click();
      await expect(selectedBackgroundText(ctx.page, background)).toBeVisible();
      await expect(useSelectedBackgroundButton(ctx.page)).toBeEnabled();
      return background;
    },
  },
  "personal_settings.use_system_default_background": {
    visible: async ({ ctx }) => {
      await expect(useSystemDefaultButton(ctx.page)).toBeVisible();
    },
    click: async ({ ctx, params }) => {
      const email = requiredString(params, "email");
      const responsePromise = waitForPreferencesSave(ctx.page);
      await useSystemDefaultButton(ctx.page).click();
      await responsePromise;
      await expect.poll(() => readAppBackgroundByEmail(email)).toBeNull();
      const defaultBackground = await readDefaultAppBackground();
      await expect.poll(() => pageUsesBackground(ctx.page, defaultBackground)).toBe(true);
      return captureSystemSkinSnapshot(ctx.page, email, defaultBackground);
    },
  },
  "personal_settings.use_selected_background": {
    visible: async ({ ctx }) => {
      await expect(useSelectedBackgroundButton(ctx.page)).toBeVisible();
    },
    click: async ({ ctx, params }) => {
      const email = requiredString(params, "email");
      const background = requiredBackground(params, "background");
      const responsePromise = waitForPreferencesSave(ctx.page);
      await useSelectedBackgroundButton(ctx.page).click();
      await responsePromise;
      await expect.poll(async () => (await readAppBackgroundByEmail(email))?.fixedBackgroundId ?? null).toBe(background.id);
      await expect.poll(() => pageUsesBackground(ctx.page, background)).toBe(true);
      return captureSystemSkinSnapshot(ctx.page, email, background);
    },
  },
  "personal_settings.delete_skin": {
    visible: async ({ ctx }) => {
      await expect(deleteSkinButton(ctx.page)).toBeVisible();
    },
    disabled: async ({ ctx }) => {
      await expect(deleteSkinButton(ctx.page)).toBeDisabled();
    },
  },
  system_skin_snapshot: {
    page_background_applied: async ({ params }) => {
      const snapshot = requiredSnapshot(params, "snapshot");
      const background = requiredBackground(params, "background");
      expect(snapshotMatchesBackground(snapshot, background)).toBe(true);
    },
    preference_is_background: async ({ params }) => {
      const snapshot = requiredSnapshot(params, "snapshot");
      const background = requiredBackground(params, "background");
      expect(snapshot.savedAppBackground?.mode).toBe("fixed");
      expect(snapshot.savedAppBackground?.fixedBackgroundId).toBe(background.id);
    },
    page_background_default: async ({ params }) => {
      const snapshot = requiredSnapshot(params, "snapshot");
      expect(snapshot.savedAppBackground).toBeNull();
      expect(snapshot.selectedBackground ? snapshotMatchesBackground(snapshot, snapshot.selectedBackground) : true).toBe(true);
    },
    preference_is_default: async ({ params }) => {
      expect(requiredSnapshot(params, "snapshot").savedAppBackground).toBeNull();
    },
  },
  system_skin_file: {
    exists: async ({ params }) => {
      const background = requiredBackground(params, "background");
      await expect.poll(() => systemBackgroundFileExists(background.id)).toBe(true);
    },
  },
} satisfies OperatorRegistry<TestContext, PersonalSettingsSystemSkinCaseData>;

async function pickSystemBackground() {
  const backgrounds = await listAppSystemBackgrounds();
  const background = backgrounds.find((item) => !item.isDefault) ?? backgrounds[0];
  if (!background) {
    throw new Error("个人设置页面缺少可选择的系统皮肤");
  }
  return background;
}

function settingsBackgroundGallery(page: Page) {
  return page.locator(".orf-settings-background-gallery").first();
}

function systemSkinCard(page: Page, background: VisualBackgroundImage) {
  return page.locator(".orf-settings-background-card").filter({ has: page.getByRole("img", { name: background.fileName }) }).first();
}

function selectedBackgroundText(page: Page, background: VisualBackgroundImage) {
  return page.locator(".orf-settings-selected-text", { hasText: `系统背景：${background.fileName}` }).first();
}

function useSystemDefaultButton(page: Page) {
  return page.getByRole("button", { name: "使用系统默认", exact: true });
}

function useSelectedBackgroundButton(page: Page) {
  return page.getByRole("button", { name: "设为我的背景", exact: true });
}

function deleteSkinButton(page: Page) {
  return page.getByRole("button", { name: "删除", exact: true }).first();
}

function waitForPreferencesSave(page: Page) {
  return page.waitForResponse((response) => {
    const request = response.request();
    return request.method().toUpperCase() === "PUT" && response.url().includes("/api/settings/personal/preferences");
  });
}

async function captureSystemSkinSnapshot(
  page: Page,
  email: string,
  selectedBackground: VisualBackgroundImage | null,
): Promise<SystemSkinSnapshot> {
  return {
    pageUrl: page.url(),
    savedAppBackground: await readAppBackgroundByEmail(email),
    selectedBackground,
    shellBackgroundImage: await shellBackgroundImage(page),
    sidebarImageSrc: await sidebarBackgroundImageSrc(page),
  };
}

async function pageUsesBackground(page: Page, background: VisualBackgroundImage) {
  const snapshot = await captureSystemSkinSnapshot(page, "__skip_preferences__", background);
  return snapshotMatchesBackground(snapshot, background);
}

async function shellBackgroundImage(page: Page) {
  return page
    .locator(".orf-app-shell")
    .evaluate((element) => getComputedStyle(element).getPropertyValue("--orf-app-chrome-bg-image"))
    .catch(() => null);
}

async function sidebarBackgroundImageSrc(page: Page) {
  return page.locator(".orf-sidebar-background-image").getAttribute("src").catch(() => null);
}

function snapshotMatchesBackground(snapshot: SystemSkinSnapshot, background: VisualBackgroundImage) {
  return textIncludesBackground(snapshot.sidebarImageSrc, background) || textIncludesBackground(snapshot.shellBackgroundImage, background);
}

function textIncludesBackground(value: string | null, background: VisualBackgroundImage) {
  if (!value) {
    return false;
  }
  const encodedFileName = encodeURIComponent(background.fileName);
  return value.includes(background.url) || value.includes(background.fileName) || value.includes(encodedFileName);
}

function requiredBackground(params: Record<string, unknown>, key: string): VisualBackgroundImage {
  const value = params[key];
  if (
    value &&
    typeof value === "object" &&
    "id" in value &&
    "fileName" in value &&
    "url" in value &&
    typeof value.id === "string" &&
    typeof value.fileName === "string" &&
    typeof value.url === "string"
  ) {
    return value as VisualBackgroundImage;
  }
  throw new Error(`参数 ${key} 必须是系统皮肤对象`);
}

function requiredSnapshot(params: Record<string, unknown>, key: string): SystemSkinSnapshot {
  const value = params[key];
  if (!value || typeof value !== "object") {
    throw new Error(`参数 ${key} 必须是系统皮肤快照`);
  }
  return value as SystemSkinSnapshot;
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
