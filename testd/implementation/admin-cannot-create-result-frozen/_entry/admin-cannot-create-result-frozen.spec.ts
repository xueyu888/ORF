import { test } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import { createCommonOperators } from "../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../_operators/registry";
import type { FrozenAdminCreateResultCaseData, TestContext } from "../_support/admin-cannot-create-result-frozen.context";
import { adminCannotCreateResultFrozenCase } from "../admin-cannot-create-result-frozen.case";
import { adminCannotCreateResultFrozenOperators } from "../admin-cannot-create-result-frozen.operators";

test.describe("实施阶段管理员不可新增指标测试用例", () => {
  test(adminCannotCreateResultFrozenCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(adminCannotCreateResultFrozenCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, FrozenAdminCreateResultCaseData>(),
        adminCannotCreateResultFrozenOperators,
      ),
      testInfo,
    });
  });
});
