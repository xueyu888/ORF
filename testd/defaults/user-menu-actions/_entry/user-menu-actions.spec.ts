import { test } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import { createCommonOperators } from "../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../_operators/registry";
import type { TestContext, UserMenuActionsCaseData } from "../_support/user-menu-actions.context";
import { userMenuActionsCase } from "../user-menu-actions.case";
import { userMenuActionsOperators } from "../user-menu-actions.operators";

test.describe("08-首页用户菜单入口操作正常测试用例", () => {
  test(userMenuActionsCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(userMenuActionsCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, UserMenuActionsCaseData>(),
        userMenuActionsOperators,
      ),
      testInfo,
    });
  });
});
