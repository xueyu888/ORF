import { test } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import { createCommonOperators } from "../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../_operators/registry";
import { backgroundPermissionCase } from "../background-permission.case";
import { backgroundPermissionOperators } from "../background-permission.operators";
import type { BackgroundPermissionCaseData, TestContext } from "../_support/background-permission.context";

test.describe("设置背景权限测试用例", () => {
  test(backgroundPermissionCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(backgroundPermissionCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, BackgroundPermissionCaseData>(),
        backgroundPermissionOperators,
      ),
      testInfo,
    });
  });
});
