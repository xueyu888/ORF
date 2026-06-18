import { test } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import { createCommonOperators } from "../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../_operators/registry";
import type { AboutUpdateStatusCaseData, TestContext } from "../_support/about-update-status.context";
import { aboutUpdateStatusCase } from "../about-update-status.case";
import { aboutUpdateStatusOperators } from "../about-update-status.operators";

test.describe("22-关于ORF检查更新与安装状态测试用例", () => {
  test(aboutUpdateStatusCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(aboutUpdateStatusCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, AboutUpdateStatusCaseData>(),
        aboutUpdateStatusOperators,
      ),
      testInfo,
    });
  });
});
