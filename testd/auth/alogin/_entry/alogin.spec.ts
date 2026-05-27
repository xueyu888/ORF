import { test } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import { createCommonOperators } from "../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../_operators/registry";
import { aloginSuccessCase } from "../alogin.case";
import { aloginOperators } from "../alogin.operators";
import type { ALoginCaseData, TestContext } from "../_support/alogin.context";
import { closeALoginTestDb } from "../_support/alogin.helpers";

test.describe("管理员登录测试用例", () => {
  test.afterAll(async () => {
    await closeALoginTestDb();
  });

  test(aloginSuccessCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(aloginSuccessCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, ALoginCaseData>(),
        aloginOperators,
      ),
      testInfo,
    });
  });
});
