import { expect, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { OperatorRegistry } from "../../_framework/types";
import { clearBrowserState } from "../../_operators/common.helpers";
import { requiredString } from "../../_operators/params";
import type { PersonalSettingsCustomSkinCaseData, TestContext } from "./_support/personal-settings-custom-skin.context";
import {
  deletePersonalBackgroundsByEmail,
  listPersonalBackgroundsByEmail,
  personalBackgroundFileExists,
  readAppBackgroundByEmail,
  readDefaultAppBackground,
  setAppBackgroundByEmail,
  setDefaultLandingPathByEmail,
} from "./_support/personal-settings-custom-skin.helpers";
import type { VisualBackgroundConfig, VisualBackgroundImage } from "../../../src/state/apiClient";

type CustomSkinSnapshot = {
  background: VisualBackgroundImage | null;
  backgroundList: VisualBackgroundImage[];
  pageUrl: string;
  savedAppBackground: VisualBackgroundConfig | null;
  shellBackgroundImage: string | null;
  toastMessage?: string;
  toastVisible?: boolean;
};

export const personalSettingsCustomSkinOperators = {
  browser: {
    clear_state: async ({ ctx }) => {
      await ctx.context.clearCookies();
      await clearBrowserState(ctx.page);
      await installClientBridgeMocks(ctx.page);
    },
  },
  "mock.skin_file": {
    prepare_image: async ({ params, runtime }) => {
      const fileName = requiredString(params, "fileName");
      const filePath = await writeFixtureFile(fileName, Buffer.from(ONE_PIXEL_PNG_BASE64, "base64"));
      runtime.values[requiredString(params, "saveAs")] = { path: filePath, fileName };
    },
    prepare_invalid: async ({ params, runtime }) => {
      const fileName = requiredString(params, "fileName");
      const filePath = await writeFixtureFile(fileName, "this is not an image file\n");
      runtime.values[requiredString(params, "saveAs")] = { path: filePath, fileName };
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
  "user.personal_backgrounds": {
    delete_by_email: async ({ params }) => {
      await deletePersonalBackgroundsByEmail(requiredString(params, "email"));
    },
    absent: async ({ params }) => {
      await expect.poll(() => listPersonalBackgroundsByEmail(requiredString(params, "email")).then((items) => items.length)).toBe(0);
    },
  },
  "personal_settings.page": {
    visible: async ({ ctx, params }) => {
      await expect(ctx.page).toHaveURL(new RegExp(requiredString(params, "pattern")));
      await expect(ctx.page.getByRole("heading", { name: "个人设置", exact: true })).toBeVisible();
    },
  },
  "personal_settings.skin_section": {
    visible: async ({ ctx }) => {
      await expect(skinSection(ctx.page)).toBeVisible();
      await expect(skinSection(ctx.page).getByRole("heading", { name: "我的 AppShell 皮肤", exact: true })).toBeVisible();
    },
  },
  "personal_settings.skin_list": {
    visible: async ({ ctx }) => {
      await expect(backgroundGallery(ctx.page)).toBeVisible();
    },
  },
  "personal_settings.upload_skin": {
    enabled: async ({ ctx }) => {
      await expect(uploadSkinButton(ctx.page)).toBeEnabled();
    },
  },
  "personal_settings.use_selected_background": {
    visible: async ({ ctx }) => {
      await expect(useSelectedBackgroundButton(ctx.page)).toBeVisible();
    },
    click: async ({ ctx, params }) => {
      const email = requiredString(params, "email");
      const background = requiredBackground(params, "background");
      await applySelectedPersonalBackground(ctx.page, email, background);
      await expect.poll(() => appShellUsesBackground(ctx.page, background), { timeout: 30_000 }).toBe(true);
      return captureCustomSkinSnapshot(ctx.page, email, background);
    },
  },
  "personal_settings.use_system_default_background": {
    click: async ({ ctx, params }) => {
      const email = requiredString(params, "email");
      const responsePromise = waitForPreferencesSave(ctx.page);
      await useSystemDefaultButton(ctx.page).click();
      await responsePromise;
      await expect.poll(() => readAppBackgroundByEmail(email)).toBeNull();
      const defaultBackground = await readDefaultAppBackground();
      return captureCustomSkinSnapshot(ctx.page, email, defaultBackground);
    },
  },
  "personal_settings.delete_skin": {
    visible: async ({ ctx }) => {
      await expect(deleteSkinButton(ctx.page)).toBeVisible();
    },
  },
  "personal_settings.custom_skin_upload": {
    choose: async ({ ctx, params }) => {
      const email = requiredString(params, "email");
      const before = await listPersonalBackgroundsByEmail(email);
      const uploadResponsePromise = waitForPersonalBackgroundUpload(ctx.page);
      const preferenceResponsePromise = waitForPreferencesSave(ctx.page);
      await skinFileInput(ctx.page).setInputFiles(requiredString(params, "filePath"));
      const uploadResponse = await uploadResponsePromise;
      await preferenceResponsePromise;
      expect(uploadResponse.status()).toBe(200);
      const after = await listPersonalBackgroundsByEmail(email);
      const background = after.find((item) => !before.some((existing) => existing.id === item.id)) ?? after.at(-1) ?? null;
      if (!background) {
        throw new Error("自定义皮肤上传后未读取到新增皮肤");
      }
      await expect.poll(async () => {
        const items = await listPersonalBackgroundsByEmail(email);
        return items.some((item) => item.id === background.id);
      }).toBe(true);
      await expect(personalSkinCard(ctx.page, background)).toBeVisible();
      await expect.poll(async () => (await readAppBackgroundByEmail(email))?.fixedBackgroundId ?? null).toBe(background.id);
      await expect.poll(() => appShellUsesBackground(ctx.page, background), { timeout: 15_000 }).toBe(true);
      return captureCustomSkinSnapshot(ctx.page, email, background);
    },
    choose_invalid: async ({ ctx, params }) => {
      const email = requiredString(params, "email");
      const message = requiredString(params, "message");
      const beforeSnapshot = requiredSnapshot(params, "beforeSnapshot");
      await chooseInvalidSkinFile(ctx.page, requiredString(params, "filePath"));
      await expect(invalidSkinUploadMessage(ctx.page, message)).toBeVisible({ timeout: 10_000 });
      const snapshot = await captureCustomSkinSnapshot(ctx.page, email, beforeSnapshot.background);
      return {
        ...snapshot,
        toastMessage: message,
        toastVisible: true,
      } satisfies CustomSkinSnapshot;
    },
  },
  "personal_settings.custom_skin_card": {
    select: async ({ ctx, params }) => {
      const background = requiredBackground(params, "background");
      const card = personalSkinCard(ctx.page, background);
      await card.click();
      await expect(useSelectedBackgroundButton(ctx.page)).toBeEnabled();
      return background;
    },
  },
  "personal_settings.delete_custom_skin": {
    click: async ({ ctx, params }) => {
      const email = requiredString(params, "email");
      const background = requiredBackground(params, "background");
      const card = await clickPersonalSkinAction(ctx.page, background, deleteSkinButton(ctx.page));
      await expect(card).toHaveCount(0, { timeout: 5_000 });
      await expect.poll(() => personalBackgroundListContains(email, background.id), { timeout: 15_000 }).toBe(false);
      await expect.poll(() => personalBackgroundFileExists(email, background.id)).toBe(false);
      const savedAppBackground = await readAppBackgroundByEmail(email);
      if (savedAppBackground === null) {
        await readDefaultAppBackground();
      }
      return captureCustomSkinSnapshot(ctx.page, email, background);
    },
  },
  custom_skin_snapshot: {
    list_contains_background: async ({ params }) => {
      const snapshot = requiredSnapshot(params, "snapshot");
      const background = requiredSnapshotBackground(snapshot);
      expect(snapshot.backgroundList.some((item) => item.id === background.id)).toBe(true);
    },
    file_exists: async ({ params }) => {
      const snapshot = requiredSnapshot(params, "snapshot");
      const background = requiredSnapshotBackground(snapshot);
      expect(snapshot.backgroundList.some((item) => item.id === background.id)).toBe(true);
    },
    toast_visible: async ({ params }) => {
      const snapshot = requiredSnapshot(params, "snapshot");
      expect(snapshot.toastVisible).toBe(true);
      expect(snapshot.toastMessage).toBe(requiredString(params, "message"));
    },
    file_unchanged: async ({ params }) => {
      const beforeSnapshot = requiredSnapshot(params, "beforeSnapshot");
      const afterSnapshot = requiredSnapshot(params, "afterSnapshot");
      expect(afterSnapshot.background?.id).toBe(beforeSnapshot.background?.id);
      expect(afterSnapshot.backgroundList.map((item) => item.id).sort()).toEqual(beforeSnapshot.backgroundList.map((item) => item.id).sort());
    },
    appshell_background_applied: async ({ params }) => {
      const snapshot = requiredSnapshot(params, "snapshot");
      const background = requiredBackground(params, "background");
      expect(appShellSnapshotMatchesBackground(snapshot, background)).toBe(true);
    },
    preference_is_background: async ({ params }) => {
      const snapshot = requiredSnapshot(params, "snapshot");
      const background = requiredBackground(params, "background");
      expect(snapshot.savedAppBackground?.mode).toBe("fixed");
      expect(snapshot.savedAppBackground?.fixedBackgroundId).toBe(background.id);
    },
    list_not_contains_background: async ({ params }) => {
      const snapshot = requiredSnapshot(params, "snapshot");
      const background = requiredSnapshotBackground(snapshot);
      expect(snapshot.backgroundList.some((item) => item.id === background.id)).toBe(false);
    },
    appshell_background_default: async ({ params }) => {
      const snapshot = requiredSnapshot(params, "snapshot");
      expect(snapshot.savedAppBackground).toBeNull();
    },
    preference_is_default: async ({ params }) => {
      expect(requiredSnapshot(params, "snapshot").savedAppBackground).toBeNull();
    },
  },
} satisfies OperatorRegistry<TestContext, PersonalSettingsCustomSkinCaseData>;

const ONE_PIXEL_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

async function writeFixtureFile(fileName: string, content: Buffer | string) {
  const dir = path.join(process.cwd(), ".artifacts", "testd", "personal-settings-custom-skin");
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, fileName);
  await writeFile(filePath, content);
  return filePath;
}

function skinSection(page: Page) {
  return page.locator(".orf-card-padding").filter({ has: page.getByRole("heading", { name: "我的 AppShell 皮肤", exact: true }) }).first();
}

function backgroundGallery(page: Page) {
  return skinSection(page).locator(".orf-settings-background-gallery").first();
}

function uploadSkinButton(page: Page) {
  return skinSection(page).getByRole("button", { name: "上传", exact: true });
}

function skinFileInput(page: Page) {
  return skinSection(page).locator('input[type="file"][accept="image/*"]');
}

function invalidSkinUploadMessage(page: Page, message: string) {
  return page
    .getByText(message, { exact: true })
    .or(page.getByText(/仅支持上传图片文件|格式不支持|不支持的文件格式|请上传图片文件/))
    .first();
}

async function chooseInvalidSkinFile(page: Page, filePath: string) {
  await skinFileInput(page).evaluate((input, fileName) => {
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(new File(["this is not an image file\n"], fileName, { type: "text/plain" }));
    const filesSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "files")?.set;
    filesSetter?.call(input, dataTransfer.files);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, path.basename(filePath));
}

function useSystemDefaultButton(page: Page) {
  return skinSection(page).getByRole("button", { name: "使用系统默认", exact: true });
}

function useSelectedBackgroundButton(page: Page) {
  return skinSection(page).getByRole("button", { name: "设为我的背景", exact: true });
}

function deleteSkinButton(page: Page) {
  return skinSection(page).getByRole("button", { name: "删除", exact: true });
}

function personalSkinCard(page: Page, background: VisualBackgroundImage) {
  return backgroundGallery(page).locator(".orf-settings-background-card").filter({ has: page.getByRole("img", { name: background.fileName }) }).first();
}

async function clickPersonalSkinAction(page: Page, background: VisualBackgroundImage, actionButton: ReturnType<typeof deleteSkinButton>) {
  const card = personalSkinCard(page, background);
  await expect(card).toBeVisible({ timeout: 10_000 });
  const deadline = Date.now() + 15_000;
  let lastError: unknown = null;

  while (Date.now() < deadline) {
    try {
      await card.click({ timeout: 1_000 });
      if (await actionButton.isEnabled().catch(() => false)) {
        await actionButton.click({ timeout: 1_000 });
        return card;
      }
    } catch (error) {
      lastError = error;
    }
    await page.waitForTimeout(150);
  }

  throw new Error(`自定义皮肤操作按钮在选择皮肤后未能稳定点击: ${String(lastError)}`);
}

function waitForPreferencesSave(page: Page, timeout = 30_000) {
  return page.waitForResponse((response) => {
    const request = response.request();
    return request.method().toUpperCase() === "PUT" && response.url().includes("/api/settings/personal/preferences");
  }, { timeout });
}

async function applySelectedPersonalBackground(page: Page, email: string, background: VisualBackgroundImage) {
  const card = personalSkinCard(page, background);
  await expect(card).toBeVisible({ timeout: 10_000 });

  const deadline = Date.now() + 30_000;
  let lastError: unknown = null;

  while (Date.now() < deadline) {
    try {
      await card.scrollIntoViewIfNeeded({ timeout: 2_000 });
      await card.click({ timeout: 2_000 });
      await expect(useSelectedBackgroundButton(page)).toBeEnabled({ timeout: 3_000 });

      const responsePromise = waitForPreferencesSave(page, 5_000);
      await useSelectedBackgroundButton(page).click({ timeout: 2_000 });
      await responsePromise;

      await expect
        .poll(async () => (await readAppBackgroundByEmail(email))?.fixedBackgroundId ?? null, { timeout: 3_000 })
        .toBe(background.id);
      return;
    } catch (error) {
      lastError = error;
      await page.waitForTimeout(300);
    }
  }

  const savedBackground = await readAppBackgroundByEmail(email);
  throw new Error(
    `自定义皮肤未成功保存为 ${background.id}，当前保存值为 ${savedBackground?.fixedBackgroundId ?? "系统默认"}。最后一次错误：${String(lastError)}`,
  );
}

function waitForPersonalBackgroundUpload(page: Page) {
  return page.waitForResponse((response) => {
    const request = response.request();
    return request.method().toUpperCase() === "POST" && response.url().endsWith("/api/settings/personal/backgrounds");
  });
}

async function captureCustomSkinSnapshot(
  page: Page,
  email: string,
  background: VisualBackgroundImage | null,
): Promise<CustomSkinSnapshot> {
  return {
    background,
    backgroundList: await listPersonalBackgroundsByEmail(email),
    pageUrl: page.url(),
    savedAppBackground: await readAppBackgroundByEmail(email),
    shellBackgroundImage: await shellBackgroundImage(page),
  };
}

async function appShellUsesBackground(page: Page, background: VisualBackgroundImage) {
  return appShellSnapshotMatchesBackground(
    {
      background,
      backgroundList: [],
      pageUrl: page.url(),
      savedAppBackground: null,
      shellBackgroundImage: await shellBackgroundImage(page),
    },
    background,
  );
}

async function personalBackgroundListContains(email: string, backgroundId: string) {
  const backgrounds = await listPersonalBackgroundsByEmail(email);
  return backgrounds.some((background) => background.id === backgroundId);
}

async function shellBackgroundImage(page: Page) {
  return page
    .locator(".orf-app-shell")
    .evaluate((element) => getComputedStyle(element).getPropertyValue("--orf-app-chrome-bg-image"))
    .catch(() => null);
}

function appShellSnapshotMatchesBackground(snapshot: CustomSkinSnapshot, background: VisualBackgroundImage) {
  return textIncludesBackground(snapshot.shellBackgroundImage, background);
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
  throw new Error(`参数 ${key} 必须是自定义皮肤对象`);
}

function requiredSnapshot(params: Record<string, unknown>, key: string): CustomSkinSnapshot {
  const value = params[key];
  if (!value || typeof value !== "object") {
    throw new Error(`参数 ${key} 必须是自定义皮肤快照`);
  }
  return value as CustomSkinSnapshot;
}

function requiredSnapshotBackground(snapshot: CustomSkinSnapshot) {
  if (!snapshot.background) {
    throw new Error("自定义皮肤快照缺少背景对象");
  }
  return snapshot.background;
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
