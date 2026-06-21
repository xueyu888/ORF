import { expect } from "@playwright/test";
import type { VisualBackgroundConfig, VisualBackgroundImage, VisualBackgroundScene } from "../../../src/state/apiClient";
import type { OperatorRegistry, StepParams } from "../../_framework/types";
import { optionalBoolean, requiredString } from "../../_operators/params";
import type {
  ApiAttemptResult,
  BackgroundSettingsCaseData,
  BackgroundSettingsTestContext,
  BackgroundSnapshots,
  PersonalSettingsSnapshot,
} from "./background-settings.context";
import {
  backgroundsMatchSnapshot,
  generateDifferentBackgroundConfig,
  readBackgroundSnapshots,
  readPersonalBackgroundsAsCurrentUser,
  readPersonalOrSystemBackgroundData,
  readPersonalSettingsSnapshot,
  readVisualBackgroundConfigFromBackgrounds,
  readVisualBackgroundConfigFromResult,
  readVisualBackgroundsAsCurrentUser,
  releaseBackgroundSettingsSnapshot,
  restoreBackgroundSnapshots,
  restorePersonalSettingsSnapshot,
  sameVisualBackgroundConfig,
  saveVisualBackgroundConfigAsCurrentUser,
  savePersonalBackgroundConfigAsCurrentUser,
  selectSkinWorkbenchSlot,
  selectPersonalBackgroundFromSettingsPage,
  selectSystemBackgroundFromSettingsPage,
  setSelectedSystemBackgroundAsDefaultFromSettingsPage,
  uploadPersonalBackgroundFromSettingsPage,
  uploadSystemBackgroundFromSettingsPage,
  useSelectedPersonalBackgroundFromSettingsPage,
} from "./background-settings.helpers";

export function createBackgroundSettingsOperators<
  TData extends BackgroundSettingsCaseData,
>(): OperatorRegistry<BackgroundSettingsTestContext, TData> {
  return {
    "api.visual_backgrounds": {
      snapshot: async () => readBackgroundSnapshots(),

      unchanged: async ({ params }) => {
        const snapshot = maybeBackgroundSnapshots(params, "snapshot");
        if (!snapshot && optionalBoolean(params, "optional")) {
          return;
        }
        const requiredSnapshot = requiredBackgroundSnapshots(params, "snapshot");
        try {
          await expect.poll(() => backgroundsMatchSnapshot(requiredSnapshot)).toBe(true);
        } finally {
          if (optionalBoolean(params, "releaseLock")) {
            await releaseBackgroundSettingsSnapshot(requiredSnapshot);
          }
        }
      },

      restore_snapshot: async ({ params }) => {
        const snapshot = maybeBackgroundSnapshots(params, "snapshot");
        if (!snapshot && optionalBoolean(params, "optional")) {
          return;
        }
        await restoreBackgroundSnapshots(requiredBackgroundSnapshots(params, "snapshot"));
      },
    },

    "api.personal_settings": {
      snapshot: async ({ params }) => readPersonalSettingsSnapshot(requiredString(params, "userId")),

      restore_snapshot: async ({ params }) => {
        const snapshot = maybePersonalSettingsSnapshot(params, "snapshot");
        if (!snapshot && optionalBoolean(params, "optional")) {
          return;
        }
        await restorePersonalSettingsSnapshot(requiredPersonalSettingsSnapshot(params, "snapshot"));
      },
    },

    "api.personal_backgrounds": {
      readable: async ({ ctx }) => {
        await expect.poll(() => readPersonalBackgroundsAsCurrentUser(ctx.page)).toMatchObject({ status: 200 });
      },

      contains_uploaded: async ({ ctx, params }) => {
        const uploaded = requiredVisualBackgroundImage(params, "uploaded");
        await expect.poll(async () => {
          const result = await readPersonalBackgroundsAsCurrentUser(ctx.page);
          const data = readPersonalOrSystemBackgroundData(result);
          return data?.list.some((background) => background.id === uploaded.id) ?? false;
        }).toBe(true);
      },

      contains_background: async ({ ctx, params }) => {
        const background = requiredVisualBackgroundImage(params, "background");
        await expect.poll(async () => {
          const result = await readPersonalBackgroundsAsCurrentUser(ctx.page);
          const data = readPersonalOrSystemBackgroundData(result);
          return data?.list.some((item) => item.id === background.id) ?? false;
        }).toBe(true);
      },

      preference_fixed_background: async ({ ctx, params }) => {
        const background = requiredVisualBackgroundImage(params, "background");
        await expect.poll(async () => {
          const result = await readPersonalBackgroundsAsCurrentUser(ctx.page);
          const data = readPersonalOrSystemBackgroundData(result);
          return "preferences" in (data ?? {}) ? data.preferences.backgrounds.sidebar_background?.fixedBackgroundId ?? null : null;
        }).toBe(background.id);
      },
    },

    "api.visual_backgrounds.scene": {
      readable: async ({ ctx, params }) => {
        await expect.poll(() => readVisualBackgroundsAsCurrentUser(ctx.page, requiredScene(params, "scene"))).toMatchObject({ status: 200 });
      },

      config_equals: async ({ ctx, params }) => {
        const expectedConfig = requiredVisualBackgroundConfig(params, "config");
        const scene = requiredScene(params, "scene");
        await expect.poll(async () => {
          const result = await readVisualBackgroundsAsCurrentUser(ctx.page, scene);
          return result.status === 200 ? readVisualBackgroundConfigFromBackgrounds(result) : null;
        }).toEqual(expectedConfig);
      },

      config_not_snapshot: async ({ ctx, params }) => {
        const snapshot = requiredBackgroundSnapshots(params, "snapshot");
        const scene = requiredScene(params, "scene");
        const snapshotConfig = snapshot[scene].config;
        await expect.poll(async () => {
          const result = await readVisualBackgroundsAsCurrentUser(ctx.page, scene);
          const currentConfig = result.status === 200 ? readVisualBackgroundConfigFromBackgrounds(result) : null;
          return currentConfig ? sameVisualBackgroundConfig(currentConfig, snapshotConfig) : true;
        }).toBe(false);
      },

      contains_background: async ({ ctx, params }) => {
        const scene = requiredScene(params, "scene");
        const background = requiredVisualBackgroundImage(params, "background");
        await expect.poll(async () => {
          const result = await readVisualBackgroundsAsCurrentUser(ctx.page, scene);
          const data = result.status === 200 ? readPersonalOrSystemBackgroundData(result) : null;
          return data?.list.some((item) => item.id === background.id) ?? false;
        }).toBe(true);
      },

      fixed_background: async ({ ctx, params }) => {
        const scene = requiredScene(params, "scene");
        const background = requiredVisualBackgroundImage(params, "background");
        await expect.poll(async () => {
          const result = await readVisualBackgroundsAsCurrentUser(ctx.page, scene);
          const config = result.status === 200 ? readVisualBackgroundConfigFromBackgrounds(result) : null;
          return config?.fixedBackgroundId ?? null;
        }).toBe(background.id);
      },
    },

    "api.visual_background_config": {
      generate_new: async ({ params }) =>
        generateDifferentBackgroundConfig(requiredBackgroundSnapshots(params, "snapshot"), requiredScene(params, "scene")),

      submit: async ({ ctx, params }) =>
        saveVisualBackgroundConfigAsCurrentUser(
          ctx.page,
          requiredScene(params, "scene"),
          requiredVisualBackgroundConfig(params, "config"),
        ),

      success: async ({ params }) => {
        expect(requiredApiAttemptResult(params, "result")).toMatchObject({ status: 200 });
      },

      contains_config: async ({ params }) => {
        const result = requiredApiAttemptResult(params, "result");
        const expectedConfig = requiredVisualBackgroundConfig(params, "config");
        expect(readVisualBackgroundConfigFromResult(result)).toEqual(expectedConfig);
      },

      forbidden: async ({ params }) => {
        expect(requiredApiAttemptResult(params, "result")).toMatchObject({ status: 403 });
      },
    },

    "api.personal_background_config": {
      generate_new: async ({ params }) =>
        generateDifferentBackgroundConfig(requiredBackgroundSnapshots(params, "snapshot"), "sidebar_background"),

      submit: async ({ ctx, params }) =>
        savePersonalBackgroundConfigAsCurrentUser(
          ctx.page,
          requiredVisualBackgroundConfig(params, "config"),
        ),

      unauthenticated: async ({ params }) => {
        expect(requiredApiAttemptResult(params, "result")).toMatchObject({ status: 401 });
      },
    },

    "api.visual_background_default": {
      success: async ({ params }) => {
        expect(requiredApiAttemptResult(params, "result")).toMatchObject({ status: 200 });
      },
    },

    "page.current_user_settings_icon": {
      visible: async ({ ctx }) => {
        await expect(currentUserSettingsIcon(ctx)).toBeVisible();
      },

      click: async ({ ctx }) => {
        await currentUserSettingsIcon(ctx).click();
      },
    },

    "page.personal_settings": {
      upload_background: async ({ ctx, params }) =>
        uploadPersonalBackgroundFromSettingsPage(ctx.page, requiredString(params, "fileName")),

      select_background: async ({ ctx, params }) => {
        await selectPersonalBackgroundFromSettingsPage(ctx.page, requiredVisualBackgroundImage(params, "background"));
      },

      use_selected_background: async ({ ctx, params }) =>
        useSelectedPersonalBackgroundFromSettingsPage(ctx.page, requiredVisualBackgroundImage(params, "background")),
    },

    "page.main_heading": {
      visible: async ({ ctx, params }) => {
        await expect(ctx.page.locator("main").getByRole("heading", { name: requiredString(params, "name"), exact: true })).toBeVisible();
      },
    },

    "page.personal_background": {
      current_visible: async ({ ctx, params }) => {
        const background = requiredVisualBackgroundImage(params, "background");
        await expect(backgroundCard(ctx.page, background).getByText("当前", { exact: true })).toBeVisible();
      },
    },

    "page.system_background": {
      upload_background: async ({ ctx, params }) =>
        uploadSystemBackgroundFromSettingsPage(ctx.page, requiredScene(params, "scene"), requiredString(params, "fileName")),

      select_background: async ({ ctx, params }) => {
        await selectSystemBackgroundFromSettingsPage(
          ctx.page,
          requiredScene(params, "scene"),
          requiredVisualBackgroundImage(params, "background"),
        );
      },

      set_selected_as_default: async ({ ctx, params }) =>
        setSelectedSystemBackgroundAsDefaultFromSettingsPage(ctx.page, requiredScene(params, "scene")),

      default_visible: async ({ ctx, params }) => {
        const scene = requiredScene(params, "scene");
        const background = requiredVisualBackgroundImage(params, "background");
        await selectSkinWorkbenchSlot(ctx.page, "system", scene);
        await expect(systemBackgroundSection(ctx.page, scene)).toBeVisible();
        await expect(systemBackgroundCard(ctx.page, scene, background).getByText("当前", { exact: true })).toBeVisible();
      },
    },

    "page.system_settings_entry": {
      hidden: async ({ ctx }) => {
        await expect(ctx.page.getByRole("link", { name: "系统管理", exact: true })).toHaveCount(0);
        await expect(ctx.page.getByRole("link", { name: "系统设置", exact: true })).toHaveCount(0);
      },
    },

    "page.settings": {
      refresh: async ({ ctx }) => {
        await ctx.page.reload();
      },
    },
  };
}

function currentUserSettingsIcon(ctx: BackgroundSettingsTestContext) {
  return ctx.page.getByLabel("用户操作").getByRole("link", { name: "设置", exact: true });
}

function backgroundCard(page: BackgroundSettingsTestContext["page"], background: VisualBackgroundImage) {
  return page.locator(".orf-skin-gallery-card", {
    has: page.getByRole("img", { name: background.fileName, exact: true }),
  });
}

function systemBackgroundCard(
  page: BackgroundSettingsTestContext["page"],
  scene: VisualBackgroundScene,
  background: VisualBackgroundImage,
) {
  return systemBackgroundSection(page, scene).locator(".orf-skin-gallery-card", {
    has: page.getByRole("img", { name: background.fileName, exact: true }),
  });
}

function systemBackgroundSection(page: BackgroundSettingsTestContext["page"], scene: VisualBackgroundScene) {
  return page.locator('.orf-skin-workbench[data-scope="system"]', {
    has: page.getByRole("heading", { name: sceneTitle(scene), exact: true }),
  });
}

function sceneTitle(scene: VisualBackgroundScene) {
  if (scene === "login_background") return "登录页";
  if (scene === "topbar_background") return "顶部栏";
  if (scene === "sidebar_background") return "侧边栏";
  return scene;
}

function requiredBackgroundSnapshots(params: StepParams, key: string): BackgroundSnapshots {
  const value = maybeBackgroundSnapshots(params, key);
  if (!value) {
    throw new Error(`参数 ${key} 必须是背景快照`);
  }
  return value;
}

function maybeBackgroundSnapshots(params: StepParams, key: string): BackgroundSnapshots | null {
  const value = params[key];
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as BackgroundSnapshots).login_background !== "object" ||
    typeof (value as BackgroundSnapshots).sidebar_background !== "object" ||
    typeof (value as BackgroundSnapshots).topbar_background !== "object" ||
    typeof (value as BackgroundSnapshots).systemSettingsFile !== "object" ||
    typeof (value as BackgroundSnapshots).legacySystemSettingsFile !== "object" ||
    typeof (value as BackgroundSnapshots).loginBackgroundSystemDirectory !== "object" ||
    typeof (value as BackgroundSnapshots).sidebarBackgroundSystemDirectory !== "object" ||
    typeof (value as BackgroundSnapshots).topbarBackgroundSystemDirectory !== "object" ||
    typeof (value as BackgroundSnapshots).lockOwner !== "string"
  ) {
    return null;
  }
  return value as BackgroundSnapshots;
}

function requiredPersonalSettingsSnapshot(params: StepParams, key: string): PersonalSettingsSnapshot {
  const value = maybePersonalSettingsSnapshot(params, key);
  if (!value) {
    throw new Error(`参数 ${key} 必须是个人设置快照`);
  }
  return value;
}

function maybePersonalSettingsSnapshot(params: StepParams, key: string): PersonalSettingsSnapshot | null {
  const value = params[key];
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as PersonalSettingsSnapshot).userId !== "string" ||
    typeof (value as PersonalSettingsSnapshot).userSettingsDirectory !== "object"
  ) {
    return null;
  }
  return value as PersonalSettingsSnapshot;
}

function requiredApiAttemptResult(params: StepParams, key: string): ApiAttemptResult {
  const value = params[key];
  if (typeof value !== "object" || value === null) {
    throw new Error(`参数 ${key} 必须是接口尝试结果`);
  }
  return value as ApiAttemptResult;
}

function requiredVisualBackgroundConfig(params: StepParams, key: string): VisualBackgroundConfig {
  const value = params[key];
  if (typeof value !== "object" || value === null) {
    throw new Error(`参数 ${key} 必须是背景配置`);
  }
  return value as VisualBackgroundConfig;
}

function requiredVisualBackgroundImage(params: StepParams, key: string): VisualBackgroundImage {
  const value = params[key];
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as VisualBackgroundImage).id !== "string" ||
    typeof (value as VisualBackgroundImage).fileName !== "string"
  ) {
    throw new Error(`参数 ${key} 必须是背景图片`);
  }
  return value as VisualBackgroundImage;
}

function requiredScene(params: StepParams, key: string): VisualBackgroundScene {
  const value = requiredString(params, key);
  if (value === "login_background" || value === "topbar_background" || value === "sidebar_background") {
    return value;
  }
  throw new Error(`参数 ${key} 必须是 login_background、topbar_background 或 sidebar_background`);
}
