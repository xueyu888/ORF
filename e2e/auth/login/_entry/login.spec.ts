import { test } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import { loginSuccessCase } from "../login.case";
import { loginOperators } from "../login.operators";
import type { TestContext } from "../_support/login.context";
import { closeLoginTestDb } from "../_support/login.helpers";

test.describe("登录测试用例", () => {
  test.afterAll(async () => {
    await closeLoginTestDb();
  });

  test(loginSuccessCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(loginSuccessCase, ctx, {
      operators: loginOperators,
      testInfo,
    });
  });
});
