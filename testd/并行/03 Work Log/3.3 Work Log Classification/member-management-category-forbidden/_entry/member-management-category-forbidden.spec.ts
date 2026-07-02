import { test } from "@playwright/test";
import { runStateCase } from "../../../../../_framework/runner";
import { createCommonOperators } from "../../../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../../../_operators/registry";
import {
  type MemberManagementCategoryForbiddenCaseData,
  type TestContext,
} from "../_support/member-management-category-forbidden.context";
import { memberManagementCategoryForbiddenCase } from "../member-management-category-forbidden.case";
import { memberManagementCategoryForbiddenOperators } from "../member-management-category-forbidden.operators";

test.describe("普通成员不能使用管理事务分类测试用例", () => {
  test(memberManagementCategoryForbiddenCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(memberManagementCategoryForbiddenCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, MemberManagementCategoryForbiddenCaseData>(),
        memberManagementCategoryForbiddenOperators,
      ),
      testInfo,
    });
  });
});
