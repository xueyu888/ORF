import { test } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import { mloginSuccessCase } from "../mlogin.case";
import { mloginOperators } from "../mlogin.operators";
import type { TestContext } from "../_support/mlogin.context";
import { closeMloginTestDb } from "../_support/mlogin.helpers";

test.describe("登录测试用例", () => {
  test.afterAll(async () => {
    await closeMloginTestDb();
  });

  test(mloginSuccessCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(mloginSuccessCase, ctx, {
      operators: mloginOperators,
      testInfo,
    });
  });
});
