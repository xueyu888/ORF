import { test } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import { createCommonOperators } from "../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../_operators/registry";
import type { AdminFreezeObjectiveCaseData, TestContext } from "../_support/admin-freeze-objective.context";
import { adminFreezeObjectiveCase } from "../admin-freeze-objective.case";
import { adminFreezeObjectiveOperators } from "../admin-freeze-objective.operators";

test.describe("管理员冻结目标进入实施阶段测试用例", () => {
  test(adminFreezeObjectiveCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(adminFreezeObjectiveCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, AdminFreezeObjectiveCaseData>(),
        adminFreezeObjectiveOperators,
      ),
      testInfo,
    });
  });
});
