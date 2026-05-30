import { test } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import { createCommonOperators } from "../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../_operators/registry";
import type { AdminDeleteMemberCaseData, TestContext } from "../_support/admin-delete-member.context";
import { adminDeleteMemberCase } from "../admin-delete-member.case";
import { adminDeleteMemberOperators } from "../admin-delete-member.operators";

test.describe("管理员删除成员测试用例", () => {
  test(adminDeleteMemberCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(adminDeleteMemberCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, AdminDeleteMemberCaseData>(),
        adminDeleteMemberOperators,
      ),
      testInfo,
    });
  });
});
