import { test } from "@playwright/test";
import { runStateCase } from "../../../../../_framework/runner";
import { createCommonOperators } from "../../../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../../../_operators/registry";
import {
  type MemberSubmitTodayWorkLogCaseData,
  type TestContext,
} from "../_support/member-submit-today-work-log.context";
import { memberSubmitTodayWorkLogCase } from "../member-submit-today-work-log.case";
import { memberSubmitTodayWorkLogOperators } from "../member-submit-today-work-log.operators";

test.describe("成员可以成功填写并提交当天日志测试用例", () => {
  test(memberSubmitTodayWorkLogCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(memberSubmitTodayWorkLogCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, MemberSubmitTodayWorkLogCaseData>(),
        memberSubmitTodayWorkLogOperators,
      ),
      testInfo,
    });
  });
});
