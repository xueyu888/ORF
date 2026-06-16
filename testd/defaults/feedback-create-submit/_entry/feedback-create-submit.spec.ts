import { test } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import { createCommonOperators } from "../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../_operators/registry";
import type { FeedbackCreateSubmitCaseData, TestContext } from "../_support/feedback-create-submit.context";
import { feedbackCreateSubmitCase } from "../feedback-create-submit.case";
import { feedbackCreateSubmitOperators } from "../feedback-create-submit.operators";

test.describe("12-新建反馈创建成功与必填校验测试用例", () => {
  test(feedbackCreateSubmitCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(feedbackCreateSubmitCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, FeedbackCreateSubmitCaseData>(),
        feedbackCreateSubmitOperators,
      ),
      testInfo,
    });
  });
});
