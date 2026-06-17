import { test } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import { createCommonOperators } from "../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../_operators/registry";
import type { PersonalSettingsSystemSkinCaseData, TestContext } from "../_support/personal-settings-system-skin.context";
import { personalSettingsSystemSkinCase } from "../personal-settings-system-skin.case";
import { personalSettingsSystemSkinOperators } from "../personal-settings-system-skin.operators";

test.describe("18-个人设置系统皮肤应用与删除限制测试用例", () => {
  test(personalSettingsSystemSkinCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(personalSettingsSystemSkinCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, PersonalSettingsSystemSkinCaseData>(),
        personalSettingsSystemSkinOperators,
      ),
      testInfo,
    });
  });
});
