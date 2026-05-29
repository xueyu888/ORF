import { test } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import { createCommonOperators } from "../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../_operators/registry";
import type { AdminFreezeObjectiveMemberForbiddenCaseData, TestContext } from "../_support/admin-freeze-objective-member-forbidden.context";
import { adminFreezeObjectiveMemberForbiddenCase } from "../admin-freeze-objective-member-forbidden.case";
import { adminFreezeObjectiveMemberForbiddenOperators } from "../admin-freeze-objective-member-forbidden.operators";

test.describe("管理员冻结目标进入实施阶段-普通成员不可冻结目标测试用例", () => {
  test(adminFreezeObjectiveMemberForbiddenCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(adminFreezeObjectiveMemberForbiddenCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, AdminFreezeObjectiveMemberForbiddenCaseData>(),
        adminFreezeObjectiveMemberForbiddenOperators,
      ),
      testInfo,
    });
  });
});
