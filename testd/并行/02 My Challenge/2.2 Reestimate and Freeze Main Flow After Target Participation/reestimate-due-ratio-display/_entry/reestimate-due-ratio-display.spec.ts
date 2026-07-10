import { test } from "@playwright/test";
import { runStateCase } from "../../../../../_framework/runner";
import { createCommonOperators } from "../../../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../../../_operators/registry";
import {
  type ReestimateDueRatioCaseData,
  type TestContext,
} from "../_support/reestimate-due-ratio-display.context";
import { reestimateDueRatioDisplayCase } from "../reestimate-due-ratio-display.case";
import { reestimateDueRatioDisplayOperators } from "../reestimate-due-ratio-display.operators";

test.describe("重估完成期限按剩余验收周期50%计算并展示测试用例", () => {
  test(reestimateDueRatioDisplayCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(reestimateDueRatioDisplayCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, ReestimateDueRatioCaseData>(),
        reestimateDueRatioDisplayOperators,
      ),
      testInfo,
    });
  });
});
