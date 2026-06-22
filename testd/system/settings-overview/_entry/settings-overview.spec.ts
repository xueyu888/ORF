import { test } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import { createCommonOperators } from "../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../_operators/registry";
import type { SystemSettingsOverviewCaseData, TestContext } from "../_support/settings-overview.context";
import { systemSettingsOverviewCase } from "../settings-overview.case";
import { systemSettingsOverviewOperators } from "../settings-overview.operators";

test.describe("13-系统设置页面基础元素展示测试用例", () => {
  test(systemSettingsOverviewCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(systemSettingsOverviewCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, SystemSettingsOverviewCaseData>(),
        systemSettingsOverviewOperators,
      ),
      testInfo,
    });
  });
});
