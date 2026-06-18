import { test } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import { createCommonOperators } from "../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../_operators/registry";
import { systemMembersFilterCase } from "../members-filter.case";
import { systemMembersFilterOperators } from "../members-filter.operators";
import type { SystemMembersFilterCaseData, TestContext } from "../_support/members-filter.context";

test.describe("04-成员管理搜索与角色筛选测试用例", () => {
  test(systemMembersFilterCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(systemMembersFilterCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, SystemMembersFilterCaseData>(),
        systemMembersFilterOperators,
      ),
      testInfo,
    });
  });
});
