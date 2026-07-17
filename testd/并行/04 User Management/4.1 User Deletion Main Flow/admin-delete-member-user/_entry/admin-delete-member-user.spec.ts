import { test } from "@playwright/test";
import { runStateCase } from "../../../../../_framework/runner";
import { createCommonOperators } from "../../../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../../../_operators/registry";
import { adminDeleteMemberUserCase } from "../admin-delete-member-user.case";
import { adminDeleteMemberUserOperators } from "../admin-delete-member-user.operators";
import type { AdminDeleteMemberUserCaseData, TestContext } from "../_support/admin-delete-member-user.context";

test.describe("管理员删除普通成员用户测试用例", () => {
  test(adminDeleteMemberUserCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(adminDeleteMemberUserCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, AdminDeleteMemberUserCaseData>(),
        adminDeleteMemberUserOperators,
      ),
      testInfo,
    });
  });
});
