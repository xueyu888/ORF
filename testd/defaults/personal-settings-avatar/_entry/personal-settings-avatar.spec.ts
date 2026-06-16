import { test } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import { createCommonOperators } from "../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../_operators/registry";
import type { PersonalSettingsAvatarCaseData, TestContext } from "../_support/personal-settings-avatar.context";
import { personalSettingsAvatarCase } from "../personal-settings-avatar.case";
import { personalSettingsAvatarOperators } from "../personal-settings-avatar.operators";

test.describe("14-个人设置头像管理校验测试用例", () => {
  test(personalSettingsAvatarCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(personalSettingsAvatarCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, PersonalSettingsAvatarCaseData>(),
        personalSettingsAvatarOperators,
      ),
      testInfo,
    });
  });
});
