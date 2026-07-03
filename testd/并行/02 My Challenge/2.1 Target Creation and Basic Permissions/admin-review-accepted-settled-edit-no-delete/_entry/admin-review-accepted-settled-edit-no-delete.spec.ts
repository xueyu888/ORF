import { test } from "@playwright/test";
import { runStateCase } from "../../../../../_framework/runner";
import { createCommonOperators } from "../../../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../../../_operators/registry";
import {
  type AdminReviewAcceptedSettledEditNoDeleteCaseData,
  type TestContext,
} from "../_support/admin-review-accepted-settled-edit-no-delete.context";
import { adminReviewAcceptedSettledEditNoDeleteCase } from "../admin-review-accepted-settled-edit-no-delete.case";
import { adminReviewAcceptedSettledEditNoDeleteOperators } from "../admin-review-accepted-settled-edit-no-delete.operators";

test.describe("验证管理员在待验收已验收已结算阶段可修改目标不可删除目标测试用例", () => {
  test(adminReviewAcceptedSettledEditNoDeleteCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(adminReviewAcceptedSettledEditNoDeleteCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, AdminReviewAcceptedSettledEditNoDeleteCaseData>(),
        adminReviewAcceptedSettledEditNoDeleteOperators,
      ),
      testInfo,
    });
  });
});
