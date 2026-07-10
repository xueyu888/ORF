import { test } from "@playwright/test";
import { runStateCase } from "../../../../../_framework/runner";
import { createCommonOperators } from "../../../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../../../_operators/registry";
import {
  type AdminMetricActionMutationAllowedCaseData,
  type TestContext,
} from "../_support/admin-metric-action-mutation-allowed.context";
import { adminMetricActionMutationAllowedCase } from "../admin-metric-action-mutation-allowed.case";
import { adminMetricActionMutationAllowedOperators } from "../admin-metric-action-mutation-allowed.operators";

test.describe("管理员在目标前期和重估中阶段可新增修改删除指标和行动项测试用例", () => {
  test(adminMetricActionMutationAllowedCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(adminMetricActionMutationAllowedCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, AdminMetricActionMutationAllowedCaseData>(),
        adminMetricActionMutationAllowedOperators,
      ),
      testInfo,
    });
  });
});
