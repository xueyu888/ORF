import { test } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import { createCommonOperators } from "../../../_operators/common.operators";
import { adminLoginInvalidCredentialsCase } from "../login-invalid-credentials.case";
import type {
  LoginInvalidCredentialsCaseData,
  TestContext,
} from "../_support/login-invalid-credentials.context";

test.describe("管理员登录表单输入校验失败测试用例", () => {
  test(adminLoginInvalidCredentialsCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(adminLoginInvalidCredentialsCase, ctx, {
      operators: createCommonOperators<TestContext, LoginInvalidCredentialsCaseData>(),
      testInfo,
    });
  });
});
