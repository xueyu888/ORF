import { test } from "@playwright/test";
import { runStateCase } from "../../../../../_framework/runner";
import { createCommonOperators } from "../../../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../../../_operators/registry";
import {
  type AdminAcceptLootCaseData,
  type TestContext,
} from "../_support/admin-accept-loot.context";
import { adminAcceptLootCase } from "../admin-accept-loot.case";
import { adminAcceptLootOperators } from "../admin-accept-loot.operators";

test.describe("管理员确认验收通过后目标进入已验收阶段测试用例", () => {
  test(adminAcceptLootCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(adminAcceptLootCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, AdminAcceptLootCaseData>(),
        adminAcceptLootOperators,
      ),
      testInfo,
    });
  });
});
