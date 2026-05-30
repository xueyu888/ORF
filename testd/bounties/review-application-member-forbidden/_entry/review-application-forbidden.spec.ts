import { test } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import { createCommonOperators } from "../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../_operators/registry";
import type { ReviewApplicationForbiddenCaseData, TestContext } from "../_support/review-application-forbidden.context";
import { reviewApplicationForbiddenCase } from "../review-application-forbidden.case";
import { reviewApplicationForbiddenOperators } from "../review-application-forbidden.operators";

test.describe("成员申请挑战审批-普通成员不可审批申请测试用例", () => {
  test(reviewApplicationForbiddenCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(reviewApplicationForbiddenCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, ReviewApplicationForbiddenCaseData>(),
        reviewApplicationForbiddenOperators,
      ),
      testInfo,
    });
  });
});
