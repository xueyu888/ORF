import { test } from "@playwright/test";
import { runStateCase } from "../../../../../_framework/runner";
import { createCommonOperators } from "../../../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../../../_operators/registry";
import {
  type MemberLeaveCategorySubmitWorkLogCaseData,
  type TestContext,
} from "../_support/member-leave-category-submit-work-log.context";
import { memberLeaveCategorySubmitWorkLogCase } from "../member-leave-category-submit-work-log.case";
import { memberLeaveCategorySubmitWorkLogOperators } from "../member-leave-category-submit-work-log.operators";

test.describe("普通成员可以选择请假分类提交日志且不需要目标和进度估计测试用例", () => {
  test(memberLeaveCategorySubmitWorkLogCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(memberLeaveCategorySubmitWorkLogCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, MemberLeaveCategorySubmitWorkLogCaseData>(),
        memberLeaveCategorySubmitWorkLogOperators,
      ),
      testInfo,
    });
  });
});
