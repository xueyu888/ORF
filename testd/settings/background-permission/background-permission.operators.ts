import { expect } from "@playwright/test";
import type { OperatorRegistry, StepParams } from "../../_framework/types";
import { requiredString } from "../../_operators/params";
import type { ApiAttemptResult, BackgroundPermissionCaseData, BackgroundSnapshots, TestContext } from "./_support/background-permission.context";
import {
  attemptSaveSidebarBackgroundConfig,
  attemptSetDefaultSidebarBackground,
  backgroundsMatchSnapshot,
  memberAccountActive,
  readBackgroundSnapshots,
  readSidebarBackgroundsAsCurrentUser,
} from "./_support/background-permission.helpers";

export const backgroundPermissionOperators = {
  "db.member": {
    active: async ({ data }) => {
      await expect.poll(() => memberAccountActive(data)).toBe(true);
    },
  },

  "api.visual_backgrounds": {
    snapshot: async () => readBackgroundSnapshots(),

    unchanged: async ({ params }) => {
      await expect.poll(() => backgroundsMatchSnapshot(requiredBackgroundSnapshots(params, "snapshot"))).toBe(true);
    },
  },

  "api.visual_backgrounds.sidebar": {
    readable: async ({ ctx }) => {
      await expect.poll(() => readSidebarBackgroundsAsCurrentUser(ctx.page)).toMatchObject({ status: 200 });
    },
  },

  "api.visual_background_config": {
    attempt_update: async ({ ctx }) => attemptSaveSidebarBackgroundConfig(ctx.page),

    forbidden: async ({ params }) => {
      expect(requiredApiAttemptResult(params, "result")).toMatchObject({ status: 403 });
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
} satisfies OperatorRegistry<TestContext, BackgroundPermissionCaseData>;

function requiredBackgroundSnapshots(params: StepParams, key: string): BackgroundSnapshots {
  const value = params[key];
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as BackgroundSnapshots).login_background !== "object" ||
    typeof (value as BackgroundSnapshots).sidebar_background !== "object"
  ) {
    throw new Error(`参数 ${key} 必须是背景快照`);
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
