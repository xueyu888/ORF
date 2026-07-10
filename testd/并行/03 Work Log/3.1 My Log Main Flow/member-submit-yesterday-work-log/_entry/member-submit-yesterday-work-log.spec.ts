import { test } from "@playwright/test";
import { runStateCase } from "../../../../../_framework/runner";
import { createCommonOperators } from "../../../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../../../_operators/registry";
import {
  type MemberSubmitYesterdayWorkLogCaseData,
  type TestContext,
} from "../_support/member-submit-yesterday-work-log.context";
import { memberSubmitYesterdayWorkLogCase } from "../member-submit-yesterday-work-log.case";
import { memberSubmitYesterdayWorkLogOperators } from "../member-submit-yesterday-work-log.operators";

test.describe("成员可以成功补填并提交昨天日志测试用例", () => {
  test(memberSubmitYesterdayWorkLogCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(memberSubmitYesterdayWorkLogCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, MemberSubmitYesterdayWorkLogCaseData>(),
        memberSubmitYesterdayWorkLogOperators,
      ),
      testInfo,
    });
  });
});
