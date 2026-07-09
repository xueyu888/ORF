import { test } from "@playwright/test";
import { runStateCase } from "../../../../../_framework/runner";
import { createCommonOperators } from "../../../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../../../_operators/registry";
import {
  type MemberTrialFeedbackFinalSubmitCaseData,
  type TestContext,
} from "../_support/member-trial-feedback-final-submit.context";
import { memberTrialFeedbackFinalSubmitCase } from "../member-trial-feedback-final-submit.case";
import { memberTrialFeedbackFinalSubmitOperators } from "../member-trial-feedback-final-submit.operators";

test.describe("普通成员可查看试验收反馈并补充完整后正式提交验收测试用例", () => {
  test(memberTrialFeedbackFinalSubmitCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(memberTrialFeedbackFinalSubmitCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, MemberTrialFeedbackFinalSubmitCaseData>(),
        memberTrialFeedbackFinalSubmitOperators,
      ),
      testInfo,
    });
  });
});
