import { test } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import { createCommonOperators } from "../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../_operators/registry";
import { feedbackEntryCase } from "../feedback-entry.case";
import { feedbackEntryOperators } from "../feedback-entry.operators";
import type { FeedbackEntryCaseData, TestContext } from "../_support/feedback-entry.context";

test.describe("02-反馈新建与详情进入测试用例", () => {
  test(feedbackEntryCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };
    await runStateCase(feedbackEntryCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, FeedbackEntryCaseData>(),
        feedbackEntryOperators,
      ),
      testInfo,
    });
  });
});
