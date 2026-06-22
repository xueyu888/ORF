import { test } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import { createCommonOperators } from "../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../_operators/registry";
import type { SystemPermissionsEffectCaseData, TestContext } from "../_support/permissions-effect.context";
import { systemPermissionsEffectCase } from "../permissions-effect.case";
import { systemPermissionsEffectOperators } from "../permissions-effect.operators";

test.describe("12-权限管理保存与生效校验测试用例", () => {
  test(systemPermissionsEffectCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(systemPermissionsEffectCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, SystemPermissionsEffectCaseData>(),
        systemPermissionsEffectOperators,
      ),
      testInfo,
    });
  });
});
