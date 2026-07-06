import { test } from "@playwright/test";
import { runStateCase } from "../../../../../_framework/runner";
import { createCommonOperators } from "../../../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../../../_operators/registry";
import {
  type AdminFreezeCalibratedReestimateObjectiveCaseData,
  type TestContext,
} from "../_support/admin-freeze-calibrated-reestimate-objective.context";
import { adminFreezeCalibratedReestimateObjectiveCase } from "../admin-freeze-calibrated-reestimate-objective.case";
import { adminFreezeCalibratedReestimateObjectiveOperators } from "../admin-freeze-calibrated-reestimate-objective.operators";

test.describe("管理员在指标已校准时可点击完成并冻结目标进入已冻结测试用例", () => {
  test(adminFreezeCalibratedReestimateObjectiveCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(adminFreezeCalibratedReestimateObjectiveCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, AdminFreezeCalibratedReestimateObjectiveCaseData>(),
        adminFreezeCalibratedReestimateObjectiveOperators,
      ),
      testInfo,
    });
  });
});
