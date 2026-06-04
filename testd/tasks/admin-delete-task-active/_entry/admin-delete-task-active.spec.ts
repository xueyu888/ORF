import { test } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import { createCommonOperators } from "../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../_operators/registry";
import {
  type AdminDeleteTaskActiveCaseData,
  type TestContext,
} from "../_support/admin-delete-task-active.context";
import { adminDeleteTaskActiveCase } from "../admin-delete-task-active.case";
import { adminDeleteTaskActiveOperators } from "../admin-delete-task-active.operators";

test.describe("管理员在执行中支持删除行动项测试用例", () => {
  test(adminDeleteTaskActiveCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(adminDeleteTaskActiveCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, AdminDeleteTaskActiveCaseData>(),
        adminDeleteTaskActiveOperators,
      ),
      testInfo,
    });
  });
});
