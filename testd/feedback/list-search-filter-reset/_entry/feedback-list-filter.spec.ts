import { test } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import { createCommonOperators } from "../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../_operators/registry";
import { feedbackListFilterCase } from "../feedback-list-filter.case";
import { feedbackListFilterOperators } from "../feedback-list-filter.operators";
import type { FeedbackListFilterCaseData, TestContext } from "../_support/feedback-list-filter.context";

test.describe("01-反馈列表搜索分类与重置测试用例", () => {
  test(feedbackListFilterCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };
    await runStateCase(feedbackListFilterCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, FeedbackListFilterCaseData>(),
        feedbackListFilterOperators,
      ),
      testInfo,
    });
  });
});
