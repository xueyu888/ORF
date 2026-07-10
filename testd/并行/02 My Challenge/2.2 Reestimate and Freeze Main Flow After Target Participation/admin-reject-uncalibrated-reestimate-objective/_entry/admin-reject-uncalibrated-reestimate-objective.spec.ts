import { test } from "@playwright/test";
import { runStateCase } from "../../../../../_framework/runner";
import { createCommonOperators } from "../../../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../../../_operators/registry";
import {
  type AdminRejectUncalibratedReestimateObjectiveCaseData,
  type TestContext,
} from "../_support/admin-reject-uncalibrated-reestimate-objective.context";
import { adminRejectUncalibratedReestimateObjectiveCase } from "../admin-reject-uncalibrated-reestimate-objective.case";
import { adminRejectUncalibratedReestimateObjectiveOperators } from "../admin-reject-uncalibrated-reestimate-objective.operators";

test.describe("管理员在指标未校准时不可完成冻结可打回重估测试用例", () => {
  test(adminRejectUncalibratedReestimateObjectiveCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(adminRejectUncalibratedReestimateObjectiveCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, AdminRejectUncalibratedReestimateObjectiveCaseData>(),
        adminRejectUncalibratedReestimateObjectiveOperators,
      ),
      testInfo,
    });
  });
});
