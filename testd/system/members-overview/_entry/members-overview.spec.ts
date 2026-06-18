import { test } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import { createCommonOperators } from "../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../_operators/registry";
import { systemMembersOverviewCase } from "../members-overview.case";
import { systemMembersOverviewOperators } from "../members-overview.operators";
import type { SystemMembersOverviewCaseData, TestContext } from "../_support/members-overview.context";

test.describe("02-成员管理页面基础元素展示测试用例", () => {
  test(systemMembersOverviewCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(systemMembersOverviewCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, SystemMembersOverviewCaseData>(),
        systemMembersOverviewOperators,
      ),
      testInfo,
    });
  });
});
