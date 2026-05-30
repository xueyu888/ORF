import { expect } from "@playwright/test";
import type { VisualBackgroundConfig } from "../../../src/state/apiClient";
import type { OperatorRegistry, StepParams } from "../../_framework/types";
import { optionalBoolean, requiredString } from "../../_operators/params";
import type { ApiAttemptResult, BackgroundSettingsCaseData, BackgroundSettingsTestContext, BackgroundSnapshots } from "./background-settings.context";
import {
  attemptSaveSidebarBackgroundConfig,
  attemptSetDefaultSidebarBackground,
  backgroundsMatchSnapshot,
  generateDifferentSidebarBackgroundConfig,
  readBackgroundSnapshots,
  readSidebarBackgroundConfigFromBackgrounds,
  readSidebarBackgroundConfigFromResult,
  readSidebarBackgroundsAsCurrentUser,
  restoreBackgroundSnapshots,
  sameVisualBackgroundConfig,
  saveSidebarBackgroundConfigAsCurrentUser,
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
        await expect.poll(() => backgroundsMatchSnapshot(requiredBackgroundSnapshots(params, "snapshot"))).toBe(true);
      },

      restore_snapshot: async ({ params }) => {
        const snapshot = maybeBackgroundSnapshots(params, "snapshot");
        if (!snapshot && optionalBoolean(params, "optional")) {
          return;
        }
        await restoreBackgroundSnapshots(requiredBackgroundSnapshots(params, "snapshot"));
      },
    },

    "api.visual_backgrounds.sidebar": {
      readable: async ({ ctx }) => {
        await expect.poll(() => readSidebarBackgroundsAsCurrentUser(ctx.page)).toMatchObject({ status: 200 });
      },

      config_equals: async ({ ctx, params }) => {
        const expectedConfig = requiredVisualBackgroundConfig(params, "config");
        await expect.poll(async () => {
          const result = await readSidebarBackgroundsAsCurrentUser(ctx.page);
          return result.status === 200 ? readSidebarBackgroundConfigFromBackgrounds(result) : null;
        }).toEqual(expectedConfig);
      },

      config_not_snapshot: async ({ ctx, params }) => {
        const snapshotConfig = requiredBackgroundSnapshots(params, "snapshot").sidebar_background.config;
        await expect.poll(async () => {
          const result = await readSidebarBackgroundsAsCurrentUser(ctx.page);
          const currentConfig = result.status === 200 ? readSidebarBackgroundConfigFromBackgrounds(result) : null;
          return currentConfig ? sameVisualBackgroundConfig(currentConfig, snapshotConfig) : true;
        }).toBe(false);
      },
    },

    "api.visual_background_config": {
      attempt_update: async ({ ctx }) => attemptSaveSidebarBackgroundConfig(ctx.page),

      generate_new: async ({ params }) => generateDifferentSidebarBackgroundConfig(requiredBackgroundSnapshots(params, "snapshot")),

      submit: async ({ ctx, params }) => saveSidebarBackgroundConfigAsCurrentUser(ctx.page, requiredVisualBackgroundConfig(params, "config")),

      forbidden: async ({ params }) => {
        expect(requiredApiAttemptResult(params, "result")).toMatchObject({ status: 403 });
      },

      success: async ({ params }) => {
        expect(requiredApiAttemptResult(params, "result")).toMatchObject({ status: 200 });
      },

      contains_config: async ({ params }) => {
        const result = requiredApiAttemptResult(params, "result");
        const expectedConfig = requiredVisualBackgroundConfig(params, "config");
        expect(readSidebarBackgroundConfigFromResult(result)).toEqual(expectedConfig);
      },
    },

    "api.visual_background_default": {
      attempt_update: async ({ ctx }) => attemptSetDefaultSidebarBackground(ctx.page),

      forbidden_or_skipped: async ({ params }) => {
        const result = requiredApiAttemptResult(params, "result");
        if (result.skipped === true) {
          return;
        }
        expect(result.status).toBe(403);
      },
    },

    "page.nav": {
      item_absent: async ({ ctx, params }) => {
        await expect(ctx.page.getByRole("link", { name: requiredString(params, "name") })).toHaveCount(0);
      },
    },

    "page.settings": {
      refresh: async ({ ctx }) => {
        await ctx.page.reload();
      },
    },
  };
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
    typeof (value as BackgroundSnapshots).userSettingsFile !== "object"
  ) {
    return null;
  }
  return value as BackgroundSnapshots;
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
