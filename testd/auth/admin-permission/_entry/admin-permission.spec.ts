import { test } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import { createCommonOperators } from "../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../_operators/registry";
import { adminPermissionUpdateCase } from "../admin-permission.case";
import { adminPermissionOperators } from "../admin-permission.operators";
import type { AdminPermissionCaseData, TestContext } from "../_support/admin-permission.context";

test.describe("管理员权限变更测试用例", () => {
  test(adminPermissionUpdateCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(adminPermissionUpdateCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, AdminPermissionCaseData>(),
        adminPermissionOperators,
      ),
      testInfo,
    });
  });
});
