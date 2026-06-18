import { test } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import { createCommonOperators } from "../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../_operators/registry";
import { systemMembersListCase } from "../members-list.case";
import { systemMembersListOperators } from "../members-list.operators";
import type { SystemMembersListCaseData, TestContext } from "../_support/members-list.context";

test.describe("03-成员管理用户列表字段展示测试用例", () => {
  test(systemMembersListCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(systemMembersListCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, SystemMembersListCaseData>(),
        systemMembersListOperators,
      ),
      testInfo,
    });
  });
});
