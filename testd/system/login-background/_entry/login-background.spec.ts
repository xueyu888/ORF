import { test } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import { createCommonOperators } from "../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../_operators/registry";
import type { SystemLoginBackgroundCaseData, TestContext } from "../_support/login-background.context";
import { systemLoginBackgroundCase } from "../login-background.case";
import { systemLoginBackgroundOperators } from "../login-background.operators";

test.describe("14-系统设置登录页背景配置测试用例", () => {
  test(systemLoginBackgroundCase.title, async ({ context, page }, testInfo) => {
    test.setTimeout(120_000);

    const ctx: TestContext = { context, page };

    await runStateCase(systemLoginBackgroundCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, SystemLoginBackgroundCaseData>(),
        systemLoginBackgroundOperators,
      ),
      testInfo,
    });
  });
});
