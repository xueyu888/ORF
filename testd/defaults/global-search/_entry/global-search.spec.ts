import { test } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import { createCommonOperators } from "../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../_operators/registry";
import { globalSearchCase } from "../global-search.case";
import { globalSearchOperators } from "../global-search.operators";
import type { GlobalSearchCaseData, TestContext } from "../_support/global-search.context";

test.describe("04-首页全局搜索展示分类结果测试用例", () => {
  test(globalSearchCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(globalSearchCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, GlobalSearchCaseData>(),
        globalSearchOperators,
      ),
      testInfo,
    });
  });
});
