import { test } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import { createCommonOperators } from "../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../_operators/registry";
import type {
  ReviewApplicationAdminApplyForbiddenCaseData,
  TestContext,
} from "../_support/review-application-admin-apply-forbidden.context";
import { reviewApplicationAdminApplyForbiddenCase } from "../review-application-admin-apply-forbidden.case";
import { reviewApplicationAdminApplyForbiddenOperators } from "../review-application-admin-apply-forbidden.operators";

test.describe("成员申请挑战审批-管理员不可申请挑战测试用例", () => {
  test(reviewApplicationAdminApplyForbiddenCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(reviewApplicationAdminApplyForbiddenCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, ReviewApplicationAdminApplyForbiddenCaseData>(),
        reviewApplicationAdminApplyForbiddenOperators,
      ),
      testInfo,
    });
  });
});
