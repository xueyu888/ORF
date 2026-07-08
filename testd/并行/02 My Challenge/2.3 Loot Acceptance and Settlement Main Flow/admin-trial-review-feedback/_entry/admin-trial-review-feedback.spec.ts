import { test } from "@playwright/test";
import { runStateCase } from "../../../../../_framework/runner";
import { createCommonOperators } from "../../../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../../../_operators/registry";
import {
  type AdminTrialReviewFeedbackCaseData,
  type TestContext,
} from "../_support/admin-trial-review-feedback.context";
import { adminTrialReviewFeedbackCase } from "../admin-trial-review-feedback.case";
import { adminTrialReviewFeedbackOperators } from "../admin-trial-review-feedback.operators";

test.describe("管理员可处理试验收并提交反馈测试用例", () => {
  test(adminTrialReviewFeedbackCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(adminTrialReviewFeedbackCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, AdminTrialReviewFeedbackCaseData>(),
        adminTrialReviewFeedbackOperators,
      ),
      testInfo,
    });
  });
});
