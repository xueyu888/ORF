import { test } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import { createCommonOperators } from "../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../_operators/registry";
import type { PersonalSettingsOverviewCaseData, TestContext } from "../_support/personal-settings-overview.context";
import { personalSettingsOverviewCase } from "../personal-settings-overview.case";
import { personalSettingsOverviewOperators } from "../personal-settings-overview.operators";

test.describe("13-个人设置页面展示与用户信息测试用例", () => {
  test(personalSettingsOverviewCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(personalSettingsOverviewCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, PersonalSettingsOverviewCaseData>(),
        personalSettingsOverviewOperators,
      ),
      testInfo,
    });
  });
});
