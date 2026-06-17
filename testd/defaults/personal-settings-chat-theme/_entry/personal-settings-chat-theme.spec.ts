import { test } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import { createCommonOperators } from "../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../_operators/registry";
import type { PersonalSettingsChatThemeCaseData, TestContext } from "../_support/personal-settings-chat-theme.context";
import { personalSettingsChatThemeCase } from "../personal-settings-chat-theme.case";
import { personalSettingsChatThemeOperators } from "../personal-settings-chat-theme.operators";

test.describe("16-个人设置聊天界面主题切换测试用例", () => {
  test(personalSettingsChatThemeCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(personalSettingsChatThemeCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, PersonalSettingsChatThemeCaseData>(),
        personalSettingsChatThemeOperators,
      ),
      testInfo,
    });
  });
});
