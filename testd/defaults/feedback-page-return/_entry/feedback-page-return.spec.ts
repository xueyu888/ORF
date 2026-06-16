import { test } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import { createCommonOperators } from "../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../_operators/registry";
import type { FeedbackPageReturnCaseData, TestContext } from "../_support/feedback-page-return.context";
import { feedbackPageReturnCase } from "../feedback-page-return.case";
import { feedbackPageReturnOperators } from "../feedback-page-return.operators";

test.describe("09-新建反馈页面展示与返回测试用例", () => {
  test(feedbackPageReturnCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(feedbackPageReturnCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, FeedbackPageReturnCaseData>(),
        feedbackPageReturnOperators,
      ),
      testInfo,
    });
  });
});
