import { test } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import { createCommonOperators } from "../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../_operators/registry";
import type { SystemPermissionsOverviewCaseData, TestContext } from "../_support/permissions-overview.context";
import { systemPermissionsOverviewCase } from "../permissions-overview.case";
import { systemPermissionsOverviewOperators } from "../permissions-overview.operators";

test.describe("10-权限管理页面展示与权限列表测试用例", () => {
  test(systemPermissionsOverviewCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(systemPermissionsOverviewCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, SystemPermissionsOverviewCaseData>(),
        systemPermissionsOverviewOperators,
      ),
      testInfo,
    });
  });
});
