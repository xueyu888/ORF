import { test } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import { createCommonOperators } from "../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../_operators/registry";
import { sidebarNavCase } from "../sidebar-nav.case";
import { sidebarNavOperators } from "../sidebar-nav.operators";
import type { SidebarNavCaseData, TestContext } from "../_support/sidebar-nav.context";

test.describe("02-首页侧边栏菜单展示与收起展开测试用例", () => {
  test(sidebarNavCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(sidebarNavCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, SidebarNavCaseData>(),
        sidebarNavOperators,
      ),
      testInfo,
    });
  });
});
