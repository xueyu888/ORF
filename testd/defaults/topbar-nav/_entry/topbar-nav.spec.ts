import { test } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import { createCommonOperators } from "../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../_operators/registry";
import { topbarNavCase } from "../topbar-nav.case";
import { topbarNavOperators } from "../topbar-nav.operators";
import type { TestContext, TopbarNavCaseData } from "../_support/topbar-nav.context";

test.describe("01-首页顶部导航栏展示完整测试用例", () => {
  test(topbarNavCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(topbarNavCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, TopbarNavCaseData>(),
        topbarNavOperators,
      ),
      testInfo,
    });
  });
});
