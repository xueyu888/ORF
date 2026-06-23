import { test } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import { createCommonOperators } from "../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../_operators/registry";
import { acquireRolePermissionLock, releaseRolePermissionLock } from "../../../_operators/role-permission-lock";
import type { SystemPermissionsConfigCaseData, TestContext } from "../_support/permissions-config.context";
import { systemPermissionsConfigCase } from "../permissions-config.case";
import { systemPermissionsConfigOperators } from "../permissions-config.operators";

test.describe("11-权限管理角色权限配置校验测试用例", () => {
  test(systemPermissionsConfigCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };
    const lockOwner = await acquireRolePermissionLock();
    try {
      await runStateCase(systemPermissionsConfigCase, ctx, {
        operators: mergeOperatorRegistries(
          createCommonOperators<TestContext, SystemPermissionsConfigCaseData>(),
          systemPermissionsConfigOperators,
        ),
        testInfo,
      });
    } finally {
      await releaseRolePermissionLock(lockOwner);
    }
  });
});
