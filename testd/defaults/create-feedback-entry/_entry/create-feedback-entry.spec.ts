import { test } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import { createCommonOperators } from "../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../_operators/registry";
import { createFeedbackEntryCase } from "../create-feedback-entry.case";
import { createFeedbackEntryOperators } from "../create-feedback-entry.operators";
import type { CreateFeedbackEntryCaseData, TestContext } from "../_support/create-feedback-entry.context";

test.describe("06-首页新建反馈入口打开表单测试用例", () => {
  test(createFeedbackEntryCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(createFeedbackEntryCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, CreateFeedbackEntryCaseData>(),
        createFeedbackEntryOperators,
      ),
      testInfo,
    });
  });
});
