import { test } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import { createCommonOperators } from "../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../_operators/registry";
import type { ReviewApplicationCaseData, TestContext } from "../_support/review-application.context";
import { closeReviewApplicationTestDb } from "../_support/review-application.helpers";
import { reviewApplicationCase } from "../review-application.case";
import { reviewApplicationOperators } from "../review-application.operators";

test.describe("成员申请挑战审批测试用例", () => {
  test.afterAll(async () => {
    await closeReviewApplicationTestDb();
  });

  test(reviewApplicationCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(reviewApplicationCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, ReviewApplicationCaseData>(),
        reviewApplicationOperators,
      ),
      testInfo,
    });
  });
});
