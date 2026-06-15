import { test } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import { createCommonOperators } from "../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../_operators/registry";
import { registerExistingEmailCase } from "../register-existing-email.case";
import { registerExistingEmailOperators } from "../register-existing-email.operators";
import type {
  RegisterExistingEmailCaseData,
  TestContext,
} from "../_support/register-existing-email.context";

test.describe("06-用户使用已注册邮箱注册失败测试用例", () => {
  test(registerExistingEmailCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(registerExistingEmailCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, RegisterExistingEmailCaseData>(),
        registerExistingEmailOperators,
      ),
      testInfo,
    });
  });
});
