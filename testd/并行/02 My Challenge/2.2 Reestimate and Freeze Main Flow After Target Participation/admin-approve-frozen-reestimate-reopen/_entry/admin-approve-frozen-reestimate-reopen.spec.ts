import { test } from "@playwright/test";
import { runStateCase } from "../../../../../_framework/runner";
import { createCommonOperators } from "../../../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../../../_operators/registry";
import {
  type AdminApproveFrozenReestimateReopenCaseData,
  type TestContext,
} from "../_support/admin-approve-frozen-reestimate-reopen.context";
import { adminApproveFrozenReestimateReopenCase } from "../admin-approve-frozen-reestimate-reopen.case";
import { adminApproveFrozenReestimateReopenOperators } from "../admin-approve-frozen-reestimate-reopen.operators";

test.describe("管理员批准重新重估后目标回到重估中且参与成员可再次申请完成重估测试用例", () => {
  test(adminApproveFrozenReestimateReopenCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(adminApproveFrozenReestimateReopenCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, AdminApproveFrozenReestimateReopenCaseData>(),
        adminApproveFrozenReestimateReopenOperators,
      ),
      testInfo,
    });
  });
});
