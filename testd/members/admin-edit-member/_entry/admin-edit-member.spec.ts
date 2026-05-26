import { test } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import { createCommonOperators } from "../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../_operators/registry";
import type { AdminEditMemberCaseData, TestContext } from "../_support/admin-edit-member.context";
import { closeAdminEditMemberTestDb } from "../_support/admin-edit-member.helpers";
import { adminEditMemberCase } from "../admin-edit-member.case";
import { adminEditMemberOperators } from "../admin-edit-member.operators";

test.describe("管理员编辑成员测试用例", () => {
  test.afterAll(async () => {
    await closeAdminEditMemberTestDb();
  });

  test(adminEditMemberCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(adminEditMemberCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, AdminEditMemberCaseData>(),
        adminEditMemberOperators,
      ),
      testInfo,
    });
  });
});
