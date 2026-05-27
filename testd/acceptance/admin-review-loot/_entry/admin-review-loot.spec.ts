import { test } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import { createCommonOperators } from "../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../_operators/registry";
import type { AdminReviewLootCaseData, TestContext } from "../_support/admin-review-loot.context";
import { adminReviewLootCase } from "../admin-review-loot.case";
import { closeAdminReviewLootTestDb, adminReviewLootOperators } from "../admin-review-loot.operators";

test.describe("管理员验收战利品测试用例", () => {
  test.afterAll(async () => {
    await closeAdminReviewLootTestDb();
  });

  test(adminReviewLootCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(adminReviewLootCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, AdminReviewLootCaseData>(),
        adminReviewLootOperators,
      ),
      testInfo,
    });
  });
});
