import { test } from "@playwright/test";
import { runStateCase } from "../../../../../_framework/runner";
import { createCommonOperators } from "../../../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../../../_operators/registry";
import {
  type MemberNewCategoryForbiddenCaseData,
  type TestContext,
} from "../_support/member-new-category-forbidden.context";
import { memberNewCategoryForbiddenCase } from "../member-new-category-forbidden.case";
import { memberNewCategoryForbiddenOperators } from "../member-new-category-forbidden.operators";

test.describe("普通成员不能新建工作日志分类测试用例", () => {
  test(memberNewCategoryForbiddenCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(memberNewCategoryForbiddenCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, MemberNewCategoryForbiddenCaseData>(),
        memberNewCategoryForbiddenOperators,
      ),
      testInfo,
    });
  });
});
