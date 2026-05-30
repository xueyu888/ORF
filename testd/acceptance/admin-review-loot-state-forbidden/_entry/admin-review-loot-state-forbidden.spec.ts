import { test } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import { createCommonOperators } from "../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../_operators/registry";
import type {
  AdminReviewLootStateForbiddenCaseData,
  TestContext,
} from "../_support/admin-review-loot-state-forbidden.context";
import { adminReviewLootStateForbiddenCase } from "../admin-review-loot-state-forbidden.case";
import { adminReviewLootStateForbiddenOperators } from "../admin-review-loot-state-forbidden.operators";

test.describe("管理员验收战利品-非待验收目标不可验收测试用例", () => {
  test(adminReviewLootStateForbiddenCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(adminReviewLootStateForbiddenCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, AdminReviewLootStateForbiddenCaseData>(),
        adminReviewLootStateForbiddenOperators,
      ),
      testInfo,
    });
  });
});
