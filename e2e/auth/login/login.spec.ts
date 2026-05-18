import { test } from "@playwright/test";
import { runStateCase } from "../../_framework/state-case.runner";
import { loginSuccessCase } from "./login.case";
import type { TestContext } from "./login.context";
import { closeLoginTestDb } from "./login.helpers";

test.describe("登录测试用例", () => {
  test.afterAll(async () => {
    await closeLoginTestDb();
  });

  test(loginSuccessCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(loginSuccessCase, ctx, testInfo);
  });
});
