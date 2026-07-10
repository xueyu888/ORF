import { test } from "@playwright/test";
import { runStateCase } from "../../../../../_framework/runner";
import { createCommonOperators } from "../../../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../../../_operators/registry";
import {
  type AdminManagementAffairsCategorySubmitWorkLogCaseData,
  type TestContext,
} from "../_support/admin-management-affairs-category-submit-work-log.context";
import { adminManagementAffairsCategorySubmitWorkLogCase } from "../admin-management-affairs-category-submit-work-log.case";
import { adminManagementAffairsCategorySubmitWorkLogOperators } from "../admin-management-affairs-category-submit-work-log.operators";

test.describe("验证管理员可以使用管理事务分类提交工作日志测试用例", () => {
  test(adminManagementAffairsCategorySubmitWorkLogCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(adminManagementAffairsCategorySubmitWorkLogCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, AdminManagementAffairsCategorySubmitWorkLogCaseData>(),
        adminManagementAffairsCategorySubmitWorkLogOperators,
      ),
      testInfo,
    });
  });
});
