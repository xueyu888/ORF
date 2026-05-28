import { test } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import { createCommonOperators } from "../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../_operators/registry";
import { createBackgroundSettingsOperators } from "../../_support/background-settings.operators";
import type { BackgroundSettingsTestContext } from "../../_support/background-settings.context";
import { backgroundAdminCase } from "../background-admin.case";

type BackgroundAdminCaseData = typeof backgroundAdminCase.data;

test.describe("设置背景管理员正向测试用例", () => {
  test(backgroundAdminCase.title, async ({ context, page }, testInfo) => {
    const ctx: BackgroundSettingsTestContext = { context, page };

    await runStateCase(backgroundAdminCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<BackgroundSettingsTestContext, BackgroundAdminCaseData>(),
        createBackgroundSettingsOperators<BackgroundAdminCaseData>(),
      ),
      testInfo,
    });
  });
});
