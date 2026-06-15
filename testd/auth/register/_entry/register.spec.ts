import { test } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import { createCommonOperators } from "../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../_operators/registry";
import { registerApprovalLoginCase } from "../register.case";
import { registerOperators } from "../register.operators";
import type { RegisterCaseData, TestContext } from "../_support/register.context";

test.describe("05-用户输入姓名邮箱和密码注册成功测试用例", () => {
  test(registerApprovalLoginCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(registerApprovalLoginCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, RegisterCaseData>(),
        registerOperators,
      ),
      testInfo,
    });
  });
});
