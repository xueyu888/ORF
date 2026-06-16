import { test } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import { createCommonOperators } from "../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../_operators/registry";
import type { FeedbackImageUploadCaseData, TestContext } from "../_support/feedback-image-upload.context";
import { feedbackImageUploadCase } from "../feedback-image-upload.case";
import { feedbackImageUploadOperators } from "../feedback-image-upload.operators";

test.describe("11-新建反馈图片上传校验测试用例", () => {
  test(feedbackImageUploadCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(feedbackImageUploadCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, FeedbackImageUploadCaseData>(),
        feedbackImageUploadOperators,
      ),
      testInfo,
    });
  });
});
