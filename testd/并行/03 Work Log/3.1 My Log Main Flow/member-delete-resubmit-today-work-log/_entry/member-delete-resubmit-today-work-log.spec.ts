import { test } from "@playwright/test";
import { runStateCase } from "../../../../../_framework/runner";
import { createCommonOperators } from "../../../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../../../_operators/registry";
import {
  type MemberDeleteResubmitTodayWorkLogCaseData,
  type TestContext,
} from "../_support/member-delete-resubmit-today-work-log.context";
import { memberDeleteResubmitTodayWorkLogCase } from "../member-delete-resubmit-today-work-log.case";
import { memberDeleteResubmitTodayWorkLogOperators } from "../member-delete-resubmit-today-work-log.operators";

test.describe("成员可以删除当天日志并重新填写提交测试用例", () => {
  test(memberDeleteResubmitTodayWorkLogCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(memberDeleteResubmitTodayWorkLogCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, MemberDeleteResubmitTodayWorkLogCaseData>(),
        memberDeleteResubmitTodayWorkLogOperators,
      ),
      testInfo,
    });
  });
});
