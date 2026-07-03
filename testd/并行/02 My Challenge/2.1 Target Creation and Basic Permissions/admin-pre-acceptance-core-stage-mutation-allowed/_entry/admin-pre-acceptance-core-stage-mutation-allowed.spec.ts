import { test } from "@playwright/test";
import { runStateCase } from "../../../../../_framework/runner";
import { createCommonOperators } from "../../../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../../../_operators/registry";
import {
  type AdminPreAcceptanceCoreStageMutationAllowedCaseData,
  type TestContext,
} from "../_support/admin-pre-acceptance-core-stage-mutation-allowed.context";
import { adminPreAcceptanceCoreStageMutationAllowedCase } from "../admin-pre-acceptance-core-stage-mutation-allowed.case";
import { adminPreAcceptanceCoreStageMutationAllowedOperators } from "../admin-pre-acceptance-core-stage-mutation-allowed.operators";

test.describe("验证管理员在目标进入待验收前的核心阶段可修改删除目标测试用例", () => {
  test(adminPreAcceptanceCoreStageMutationAllowedCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(adminPreAcceptanceCoreStageMutationAllowedCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, AdminPreAcceptanceCoreStageMutationAllowedCaseData>(),
        adminPreAcceptanceCoreStageMutationAllowedOperators,
      ),
      testInfo,
    });
  });
});
