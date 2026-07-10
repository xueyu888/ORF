import { test } from "@playwright/test";
import { runStateCase } from "../../../../../_framework/runner";
import { createCommonOperators } from "../../../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../../../_operators/registry";
import {
  type AdminSettleLootCaseData,
  type TestContext,
} from "../_support/admin-settle-loot.context";
import { adminSettleLootCase } from "../admin-settle-loot.case";
import { adminSettleLootOperators } from "../admin-settle-loot.operators";

test.describe("管理员在已验收阶段可点击去结算成功结算后目标进入已结算阶段测试用例", () => {
  test(adminSettleLootCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(adminSettleLootCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, AdminSettleLootCaseData>(),
        adminSettleLootOperators,
      ),
      testInfo,
    });
  });
});
