import { test } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import { createCommonOperators } from "../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../_operators/registry";
import type { AboutCloseReturnCaseData, TestContext } from "../_support/about-close-return.context";
import { aboutCloseReturnCase } from "../about-close-return.case";
import { aboutCloseReturnOperators } from "../about-close-return.operators";

test.describe("23-关于ORF页面关闭返回原页面测试用例", () => {
  test(aboutCloseReturnCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(aboutCloseReturnCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, AboutCloseReturnCaseData>(),
        aboutCloseReturnOperators,
      ),
      testInfo,
    });
  });
});
