import { test } from "@playwright/test";
import { runStateCase } from "../../../../../_framework/runner";
import { createCommonOperators } from "../../../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../../../_operators/registry";
import {
  type MemberEditYesterdayWorkLogCaseData,
  type TestContext,
} from "../_support/member-edit-yesterday-work-log.context";
import { memberEditYesterdayWorkLogCase } from "../member-edit-yesterday-work-log.case";
import { memberEditYesterdayWorkLogOperators } from "../member-edit-yesterday-work-log.operators";

test.describe("成员可以编辑昨天已写好的日志测试用例", () => {
  test(memberEditYesterdayWorkLogCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(memberEditYesterdayWorkLogCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, MemberEditYesterdayWorkLogCaseData>(),
        memberEditYesterdayWorkLogOperators,
      ),
      testInfo,
    });
  });
});
