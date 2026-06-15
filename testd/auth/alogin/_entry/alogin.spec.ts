import { test } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import { createCommonOperators } from "../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../_operators/registry";
import { aloginSuccessCase } from "../alogin.case";
import { aloginOperators } from "../alogin.operators";
import type { ALoginCaseData, TestContext } from "../_support/alogin.context";

test.describe("管理员使用匹配邮箱和密码登录成功测试用例", () => {
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
