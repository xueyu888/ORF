import { test } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import { createCommonOperators } from "../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../_operators/registry";
import type { AdminDisableMemberCaseData, TestContext } from "../_support/admin-disable-member.context";
import { adminDisableMemberCase } from "../admin-disable-member.case";
import { adminDisableMemberOperators } from "../admin-disable-member.operators";

test.describe("管理员停用成员测试用例", () => {
  test(adminDisableMemberCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(adminDisableMemberCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, AdminDisableMemberCaseData>(),
        adminDisableMemberOperators,
      ),
      testInfo,
    });
  });
});
