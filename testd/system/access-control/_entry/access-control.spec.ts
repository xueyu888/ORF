import { test } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import { createCommonOperators } from "../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../_operators/registry";
import { systemAccessControlCase } from "../access-control.case";
import { systemAccessControlOperators } from "../access-control.operators";
import type { SystemAccessControlCaseData, TestContext } from "../_support/access-control.context";

test.describe("01-系统管理页面访问权限控制测试用例", () => {
  test(systemAccessControlCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(systemAccessControlCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, SystemAccessControlCaseData>(),
        systemAccessControlOperators,
      ),
      testInfo,
    });
  });
});
