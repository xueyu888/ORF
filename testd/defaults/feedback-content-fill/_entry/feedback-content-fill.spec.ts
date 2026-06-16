import { test } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import { createCommonOperators } from "../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../_operators/registry";
import type { FeedbackContentFillCaseData, TestContext } from "../_support/feedback-content-fill.context";
import { feedbackContentFillCase } from "../feedback-content-fill.case";
import { feedbackContentFillOperators } from "../feedback-content-fill.operators";

test.describe("10-新建反馈内容填写与选择测试用例", () => {
  test(feedbackContentFillCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(feedbackContentFillCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, FeedbackContentFillCaseData>(),
        feedbackContentFillOperators,
      ),
      testInfo,
    });
  });
});
