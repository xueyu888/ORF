import { test } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import { createCommonOperators } from "../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../_operators/registry";
import { globalSearchResultStateCase } from "../global-search-result-state.case";
import { globalSearchResultStateOperators } from "../global-search-result-state.operators";
import type { GlobalSearchResultStateCaseData, TestContext } from "../_support/global-search-result-state.context";

test.describe("05-首页全局搜索结果跳转和无结果提示测试用例", () => {
  test(globalSearchResultStateCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(globalSearchResultStateCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, GlobalSearchResultStateCaseData>(),
        globalSearchResultStateOperators,
      ),
      testInfo,
    });
  });
});
