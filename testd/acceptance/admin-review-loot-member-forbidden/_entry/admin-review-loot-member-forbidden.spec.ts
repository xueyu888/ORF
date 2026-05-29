import { test } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import { createCommonOperators } from "../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../_operators/registry";
import type {
  AdminReviewLootMemberForbiddenCaseData,
  TestContext,
} from "../_support/admin-review-loot-member-forbidden.context";
import { adminReviewLootMemberForbiddenCase } from "../admin-review-loot-member-forbidden.case";
import { adminReviewLootMemberForbiddenOperators } from "../admin-review-loot-member-forbidden.operators";

test.describe("管理员验收战利品-普通成员不可验收测试用例", () => {
  test(adminReviewLootMemberForbiddenCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(adminReviewLootMemberForbiddenCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, AdminReviewLootMemberForbiddenCaseData>(),
        adminReviewLootMemberForbiddenOperators,
      ),
      testInfo,
    });
  });
});
