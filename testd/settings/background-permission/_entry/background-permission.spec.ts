import { test } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import { createCommonOperators } from "../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../_operators/registry";
import { backgroundPersonalCases } from "../background-permission.case";
import { backgroundPersonalOperators } from "../background-permission.operators";
import type { BackgroundPersonalCaseData, TestContext } from "../_support/background-permission.context";

test.describe("设置背景个人设置测试用例", () => {
  test.describe.configure({ mode: "serial" });

  for (const testCase of backgroundPersonalCases) {
    test(testCase.title, async ({ context, page }, testInfo) => {
      const ctx: TestContext = { context, page };

      await runStateCase(testCase, ctx, {
        operators: mergeOperatorRegistries(
          createCommonOperators<TestContext, BackgroundPersonalCaseData>(),
          backgroundPersonalOperators,
        ),
        testInfo,
      });
    });
  }
});
