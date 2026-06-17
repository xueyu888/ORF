import { test } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import { createCommonOperators } from "../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../_operators/registry";
import type { PersonalSettingsToastNotificationCaseData, TestContext } from "../_support/personal-settings-toast-notification.context";
import { personalSettingsToastNotificationCase } from "../personal-settings-toast-notification.case";
import { personalSettingsToastNotificationOperators } from "../personal-settings-toast-notification.operators";

test.describe("17-个人设置Toast通知开关校验测试用例", () => {
  test(personalSettingsToastNotificationCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(personalSettingsToastNotificationCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, PersonalSettingsToastNotificationCaseData>(),
        personalSettingsToastNotificationOperators,
      ),
      testInfo,
    });
  });
});
