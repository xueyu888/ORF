import { test } from "@playwright/test";
import { createCommonOperators } from "../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../_operators/registry";
import { runStateCase } from "../../../_framework/runner";
import { mloginSuccessCase } from "../mlogin.case";
import { mloginOperators } from "../mlogin.operators";
import type { MloginCaseData, TestContext } from "../_support/mlogin.context";

test.describe("登录测试用例", () => {
  test(mloginSuccessCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(mloginSuccessCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, MloginCaseData>(),
        mloginOperators,
      ),
      testInfo,
    });
  });
});
