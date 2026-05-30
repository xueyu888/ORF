import { test } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import { createCommonOperators } from "../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../_operators/registry";
import { registerInvalidCredentialsCase } from "../register-invalid-credentials.case";
import { registerInvalidCredentialsOperators } from "../register-invalid-credentials.operators";
import type {
  RegisterInvalidCredentialsCaseData,
  TestContext,
} from "../_support/register-invalid-credentials.context";

test.describe("账号注册登录反向测试用例", () => {
  test(registerInvalidCredentialsCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(registerInvalidCredentialsCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, RegisterInvalidCredentialsCaseData>(),
        registerInvalidCredentialsOperators,
      ),
      testInfo,
    });
  });
});
