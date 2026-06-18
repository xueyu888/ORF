import { test } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import { createCommonOperators } from "../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../_operators/registry";
import type { SystemMembersStatusCaseData, TestContext } from "../_support/members-status.context";
import { systemMembersStatusCase } from "../members-status.case";
import { systemMembersStatusOperators } from "../members-status.operators";

test.describe("07-成员管理停用启用用户校验测试用例", () => {
  test(systemMembersStatusCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(systemMembersStatusCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, SystemMembersStatusCaseData>(),
        systemMembersStatusOperators,
      ),
      testInfo,
    });
  });
});
