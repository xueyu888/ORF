import { test } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import { createCommonOperators } from "../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../_operators/registry";
import type { PersonalSettingsPreferencesCaseData, TestContext } from "../_support/personal-settings-preferences.context";
import { personalSettingsPreferencesCase } from "../personal-settings-preferences.case";
import { personalSettingsPreferencesOperators } from "../personal-settings-preferences.operators";

test.describe("15-个人设置默认进入页面和侧边栏状态测试用例", () => {
  test(personalSettingsPreferencesCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(personalSettingsPreferencesCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, PersonalSettingsPreferencesCaseData>(),
        personalSettingsPreferencesOperators,
      ),
      testInfo,
    });
  });
});
