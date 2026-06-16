import { test } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import { createCommonOperators } from "../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../_operators/registry";
import { systemAdminEntryCase } from "../system-admin-entry.case";
import { systemAdminEntryOperators } from "../system-admin-entry.operators";
import type { SystemAdminEntryCaseData, TestContext } from "../_support/system-admin-entry.context";

test.describe("03-首页系统管理入口按角色展示测试用例", () => {
  test(systemAdminEntryCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(systemAdminEntryCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, SystemAdminEntryCaseData>(),
        systemAdminEntryOperators,
      ),
      testInfo,
    });
  });
});
