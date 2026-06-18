import { test } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import { createCommonOperators } from "../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../_operators/registry";
import type { PersonalSettingsCustomSkinCaseData, TestContext } from "../_support/personal-settings-custom-skin.context";
import { personalSettingsCustomSkinCase } from "../personal-settings-custom-skin.case";
import { personalSettingsCustomSkinOperators } from "../personal-settings-custom-skin.operators";

test.describe("19-个人设置自定义皮肤管理校验测试用例", () => {
  test(personalSettingsCustomSkinCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(personalSettingsCustomSkinCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, PersonalSettingsCustomSkinCaseData>(),
        personalSettingsCustomSkinOperators,
      ),
      testInfo,
    });
  });
});
