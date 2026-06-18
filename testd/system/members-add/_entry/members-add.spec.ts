import { test } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import { createCommonOperators } from "../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../_operators/registry";
import { systemMembersAddCase } from "../members-add.case";
import { systemMembersAddOperators } from "../members-add.operators";
import type { SystemMembersAddCaseData, TestContext } from "../_support/members-add.context";

test.describe("05-成员管理新增用户校验测试用例", () => {
  test(systemMembersAddCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(systemMembersAddCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, SystemMembersAddCaseData>(),
        systemMembersAddOperators,
      ),
      testInfo,
    });
  });
});
