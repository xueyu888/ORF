import { test } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import { createCommonOperators } from "../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../_operators/registry";
import {
  type AdminDeleteTaskReestimateCaseData,
  type TestContext,
} from "../_support/admin-delete-task-reestimate.context";
import { adminDeleteTaskReestimateCase } from "../admin-delete-task-reestimate.case";
import { adminDeleteTaskReestimateOperators } from "../admin-delete-task-reestimate.operators";

test.describe("管理员在重估中支持删除行动项测试用例", () => {
  test(adminDeleteTaskReestimateCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(adminDeleteTaskReestimateCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, AdminDeleteTaskReestimateCaseData>(),
        adminDeleteTaskReestimateOperators,
      ),
      testInfo,
    });
  });
});
