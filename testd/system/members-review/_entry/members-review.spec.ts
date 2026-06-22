import { test } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import { createCommonOperators } from "../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../_operators/registry";
import type { SystemMembersReviewCaseData, TestContext } from "../_support/members-review.context";
import { systemMembersReviewCase } from "../members-review.case";
import { systemMembersReviewOperators } from "../members-review.operators";

test.describe("08-成员管理注册申请审核校验测试用例", () => {
  test(systemMembersReviewCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(systemMembersReviewCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, SystemMembersReviewCaseData>(),
        systemMembersReviewOperators,
      ),
      testInfo,
    });
  });
});
