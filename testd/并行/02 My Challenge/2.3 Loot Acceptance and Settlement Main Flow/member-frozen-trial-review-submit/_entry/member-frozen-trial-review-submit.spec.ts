import { test } from "@playwright/test";
import { runStateCase } from "../../../../../_framework/runner";
import { createCommonOperators } from "../../../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../../../_operators/registry";
import {
  type MemberFrozenTrialReviewSubmitCaseData,
  type TestContext,
} from "../_support/member-frozen-trial-review-submit.context";
import { memberFrozenTrialReviewSubmitCase } from "../member-frozen-trial-review-submit.case";
import { memberFrozenTrialReviewSubmitOperators } from "../member-frozen-trial-review-submit.operators";

test.describe("普通成员在已冻结阶段可填写完整战利品并提交试验收测试用例", () => {
  test(memberFrozenTrialReviewSubmitCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(memberFrozenTrialReviewSubmitCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, MemberFrozenTrialReviewSubmitCaseData>(),
        memberFrozenTrialReviewSubmitOperators,
      ),
      testInfo,
    });
  });
});
