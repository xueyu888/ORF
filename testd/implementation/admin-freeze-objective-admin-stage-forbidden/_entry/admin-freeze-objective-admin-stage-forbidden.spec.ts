import { test } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import { createCommonOperators } from "../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../_operators/registry";
import type {
  AdminFreezeObjectiveAdminStageForbiddenCaseData,
  TestContext,
} from "../_support/admin-freeze-objective-admin-stage-forbidden.context";
import { adminFreezeObjectiveAdminStageForbiddenCase } from "../admin-freeze-objective-admin-stage-forbidden.case";
import { adminFreezeObjectiveAdminStageForbiddenOperators } from "../admin-freeze-objective-admin-stage-forbidden.operators";

test.describe("管理员冻结目标进入实施阶段-管理员不可冻结评估阶段之外目标测试用例", () => {
  test(adminFreezeObjectiveAdminStageForbiddenCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(adminFreezeObjectiveAdminStageForbiddenCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, AdminFreezeObjectiveAdminStageForbiddenCaseData>(),
        adminFreezeObjectiveAdminStageForbiddenOperators,
      ),
      testInfo,
    });
  });
});
