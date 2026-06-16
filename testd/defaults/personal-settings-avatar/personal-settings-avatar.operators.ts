import { expect, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { OperatorRegistry } from "../../_framework/types";
import { clearBrowserState } from "../../_operators/common.helpers";
import { requiredString } from "../../_operators/params";
import type { PersonalSettingsAvatarCaseData, TestContext } from "./_support/personal-settings-avatar.context";
import {
  deleteAvatarByEmail,
  readAvatarObjectKeyByEmail,
  setDefaultLandingPathByEmail,
} from "./_support/personal-settings-avatar.helpers";

type AvatarSnapshot = {
  avatarObjectKey: string | null;
  customAvatarVisible: boolean;
  defaultAvatarVisible: boolean;
  toastMessage?: string;
  toastVisible?: boolean;
};

export const personalSettingsAvatarOperators = {
  browser: {
    clear_state: async ({ ctx }) => {
      await ctx.context.clearCookies();
      await clearBrowserState(ctx.page);
      await installDesktopShellMock(ctx.page);
    },
  },
  "mock.avatar_file": {
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
    set_default_landing_path_by_email: async ({ params }) => {
      await setDefaultLandingPathByEmail(requiredString(params, "email"), requiredString(params, "path"));
    },
    reset_default_landing_path_by_email: async ({ params }) => {
      await setDefaultLandingPathByEmail(requiredString(params, "email"), null);
    },
  },
  "user.avatar": {
    delete_by_email: async ({ params }) => {
      await deleteAvatarByEmail(requiredString(params, "email"));
    },
  },
  "db.user_avatar": {
    absent: async ({ params }) => {
      await expect.poll(() => readAvatarObjectKeyByEmail(requiredString(params, "email"))).toBeNull();
    },
  },
  "personal_settings.page": {
    visible: async ({ ctx, params }) => {
      await expect(ctx.page).toHaveURL(new RegExp(requiredString(params, "pattern")));
      await expect(ctx.page.getByRole("heading", { name: "个人设置", exact: true })).toBeVisible();
    },
  },
  "personal_settings.current_user_avatar": {
    default_visible: async ({ ctx }) => {
      await expect(currentUserAvatar(ctx.page)).toBeVisible();
      await expect(customAvatarTrigger(ctx.page)).toHaveCount(0);
    },
  },
  "personal_settings.upload_avatar": {
    enabled: async ({ ctx }) => {
      await expect(uploadAvatarButton(ctx.page)).toBeEnabled();
    },
  },
  "personal_settings.delete_avatar": {
    disabled: async ({ ctx }) => {
      await expect(deleteAvatarButton(ctx.page)).toBeDisabled();
    },
  },
  "personal_settings.avatar_upload": {
    choose: async ({ ctx, params }) => {
      const filePath = requiredString(params, "filePath");
      const email = requiredString(params, "email");
      await avatarFileInput(ctx.page).setInputFiles(filePath);
      await expect(customAvatarTrigger(ctx.page)).toBeVisible();
      const avatarObjectKey = await waitForAvatarObjectKey(email);
      return {
        avatarObjectKey,
        customAvatarVisible: await customAvatarTrigger(ctx.page).isVisible(),
        defaultAvatarVisible: await defaultAvatarVisible(ctx.page),
      } satisfies AvatarSnapshot;
    },
    choose_invalid: async ({ ctx, params }) => {
      const filePath = requiredString(params, "filePath");
      const email = requiredString(params, "email");
      const message = requiredString(params, "message");
      const beforeAvatarObjectKey = await readAvatarObjectKeyByEmail(email);
      await avatarFileInput(ctx.page).setInputFiles(filePath);
      await expect(ctx.page.getByRole("status").getByText(message, { exact: true })).toBeVisible();
      const afterAvatarObjectKey = await readAvatarObjectKeyByEmail(email);
      return {
        avatarObjectKey: afterAvatarObjectKey,
        beforeAvatarObjectKey,
        customAvatarVisible: await customAvatarTrigger(ctx.page).isVisible(),
        defaultAvatarVisible: await defaultAvatarVisible(ctx.page),
        toastMessage: message,
        toastVisible: true,
      };
    },
  },
  "personal_settings.avatar_delete": {
    click: async ({ ctx, params }) => {
      const email = requiredString(params, "email");
      await deleteAvatarButton(ctx.page).click();
      await expect.poll(() => readAvatarObjectKeyByEmail(email)).toBeNull();
      await expect(customAvatarTrigger(ctx.page)).toHaveCount(0);
      return {
        avatarObjectKey: null,
        customAvatarVisible: await customAvatarTrigger(ctx.page).isVisible().catch(() => false),
        defaultAvatarVisible: await defaultAvatarVisible(ctx.page),
      } satisfies AvatarSnapshot;
    },
  },
  avatar_snapshot: {
    custom_visible: async ({ params }) => {
      const snapshot = requiredAvatarSnapshot(params, "snapshot");
      expect(snapshot.customAvatarVisible).toBe(true);
      expect(snapshot.defaultAvatarVisible).toBe(false);
    },
    db_avatar_exists: async ({ params }) => {
      const snapshot = requiredAvatarSnapshot(params, "snapshot");
      expect(snapshot.avatarObjectKey).toEqual(expect.any(String));
    },
    toast_visible: async ({ params }) => {
      const snapshot = requiredAvatarSnapshot(params, "snapshot");
      expect(snapshot.toastVisible).toBe(true);
      expect(snapshot.toastMessage).toBe(requiredString(params, "message"));
    },
    db_avatar_unchanged: async ({ params }) => {
      const beforeSnapshot = requiredAvatarSnapshot(params, "beforeSnapshot");
      const afterSnapshot = requiredAvatarSnapshot(params, "afterSnapshot");
      expect(afterSnapshot.avatarObjectKey).toBe(beforeSnapshot.avatarObjectKey);
      expect(afterSnapshot.avatarObjectKey).toEqual(expect.any(String));
    },
    default_visible: async ({ params }) => {
      const snapshot = requiredAvatarSnapshot(params, "snapshot");
      expect(snapshot.defaultAvatarVisible).toBe(true);
      expect(snapshot.customAvatarVisible).toBe(false);
    },
    db_avatar_absent: async ({ params }) => {
      const snapshot = requiredAvatarSnapshot(params, "snapshot");
      expect(snapshot.avatarObjectKey).toBeNull();
    },
  },
} satisfies OperatorRegistry<TestContext, PersonalSettingsAvatarCaseData>;

const ONE_PIXEL_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

async function writeFixtureFile(fileName: string, content: Buffer | string) {
  const dir = path.join(process.cwd(), ".artifacts", "testd", "personal-settings-avatar");
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, fileName);
  await writeFile(filePath, content);
  return filePath;
}

async function waitForAvatarObjectKey(email: string) {
  await expect.poll(() => readAvatarObjectKeyByEmail(email)).not.toBeNull();
  const avatarObjectKey = await readAvatarObjectKeyByEmail(email);
  if (!avatarObjectKey) {
    throw new Error("头像上传后数据库未记录自定义头像");
  }
  return avatarObjectKey;
}

function currentUserCard(page: Page) {
  return page.locator(".orf-card-padding").filter({ has: page.getByRole("button", { name: "上传头像" }) }).first();
}

function currentUserAvatar(page: Page) {
  return currentUserCard(page).locator("div[title]").first();
}

function customAvatarTrigger(page: Page) {
  return currentUserCard(page).locator(".orf-avatar-preview-trigger");
}

function uploadAvatarButton(page: Page) {
  return currentUserCard(page).getByRole("button", { name: "上传头像" });
}

function deleteAvatarButton(page: Page) {
  return currentUserCard(page).getByRole("button", { name: "删除" });
}

function avatarFileInput(page: Page) {
  return currentUserCard(page).locator('input[type="file"][accept="image/gif,image/jpeg,image/png,image/webp"]');
}

async function defaultAvatarVisible(page: Page) {
  return (await currentUserAvatar(page).isVisible().catch(() => false))
    && (await customAvatarTrigger(page).count()) === 0;
}

function requiredAvatarSnapshot(params: Record<string, unknown>, key: string): AvatarSnapshot {
  const value = params[key];
  if (!value || typeof value !== "object") {
    throw new Error(`参数 ${key} 必须是头像快照`);
  }
  return value as AvatarSnapshot;
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
