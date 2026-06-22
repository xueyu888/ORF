import { test } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import { createCommonOperators } from "../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../_operators/registry";
import type { SystemMembersDeleteCaseData, TestContext } from "../_support/members-delete.context";
import { systemMembersDeleteCase } from "../members-delete.case";
import { systemMembersDeleteOperators } from "../members-delete.operators";

test.describe("09-成员管理删除用户校验测试用例", () => {
  test(systemMembersDeleteCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(systemMembersDeleteCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, SystemMembersDeleteCaseData>(),
        systemMembersDeleteOperators,
      ),
      testInfo,
    });
  });
});
