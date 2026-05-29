import { test } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import { createCommonOperators } from "../../../_operators/common.operators";
import { memberLoginInvalidCredentialsCase } from "../login-invalid-credentials.case";
import type {
  LoginInvalidCredentialsCaseData,
  TestContext,
} from "../_support/login-invalid-credentials.context";
import { closeLoginInvalidCredentialsTestDb } from "../_support/login-invalid-credentials.helpers";

test.describe("member登录反向测试用例", () => {
  test.afterAll(async () => {
    await closeLoginInvalidCredentialsTestDb();
  });

  test(memberLoginInvalidCredentialsCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(memberLoginInvalidCredentialsCase, ctx, {
      operators: createCommonOperators<TestContext, LoginInvalidCredentialsCaseData>(),
      testInfo,
    });
  });
});
