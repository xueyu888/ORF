import { test } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import { createCommonOperators } from "../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../_operators/registry";
import type { AdminCreateResultCaseData, TestContext } from "../_support/admin-create-result.context";
import { adminCreateResultCase } from "../admin-create-result.case";
import { adminCreateResultOperators } from "../admin-create-result.operators";

test.describe("管理员新增指标测试用例", () => {
  test(adminCreateResultCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(adminCreateResultCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, AdminCreateResultCaseData>(),
        adminCreateResultOperators,
      ),
      testInfo,
    });
  });
});
