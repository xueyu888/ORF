import { test } from "@playwright/test";
import { runStateCase } from "../../../../../_framework/runner";
import { createCommonOperators } from "../../../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../../../_operators/registry";
import {
  type MemberDeleteResubmitYesterdayWorkLogCaseData,
  type TestContext,
} from "../_support/member-delete-resubmit-yesterday-work-log.context";
import { memberDeleteResubmitYesterdayWorkLogCase } from "../member-delete-resubmit-yesterday-work-log.case";
import { memberDeleteResubmitYesterdayWorkLogOperators } from "../member-delete-resubmit-yesterday-work-log.operators";

test.describe("成员可以删除昨天日志并重新填写提交测试用例", () => {
  test(memberDeleteResubmitYesterdayWorkLogCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(memberDeleteResubmitYesterdayWorkLogCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, MemberDeleteResubmitYesterdayWorkLogCaseData>(),
        memberDeleteResubmitYesterdayWorkLogOperators,
      ),
      testInfo,
    });
  });
});
