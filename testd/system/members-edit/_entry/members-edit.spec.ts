import { test } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import { createCommonOperators } from "../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../_operators/registry";
import { systemMembersEditCase } from "../members-edit.case";
import { systemMembersEditOperators } from "../members-edit.operators";
import type { SystemMembersEditCaseData, TestContext } from "../_support/members-edit.context";

test.describe("06-成员管理编辑用户校验测试用例", () => {
  test(systemMembersEditCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(systemMembersEditCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, SystemMembersEditCaseData>(),
        systemMembersEditOperators,
      ),
      testInfo,
    });
  });
});
