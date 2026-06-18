import { test } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import { createCommonOperators } from "../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../_operators/registry";
import type { AboutVersionInfoCaseData, TestContext } from "../_support/about-version-info.context";
import { aboutVersionInfoCase } from "../about-version-info.case";
import { aboutVersionInfoOperators } from "../about-version-info.operators";

test.describe("21-关于ORF版本信息展示测试用例", () => {
  test(aboutVersionInfoCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(aboutVersionInfoCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, AboutVersionInfoCaseData>(),
        aboutVersionInfoOperators,
      ),
      testInfo,
    });
  });
});
