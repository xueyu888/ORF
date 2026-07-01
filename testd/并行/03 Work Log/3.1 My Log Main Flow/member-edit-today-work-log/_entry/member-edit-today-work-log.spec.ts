import { test } from "@playwright/test";
import { runStateCase } from "../../../../../_framework/runner";
import { createCommonOperators } from "../../../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../../../_operators/registry";
import {
  type MemberEditTodayWorkLogCaseData,
  type TestContext,
} from "../_support/member-edit-today-work-log.context";
import { memberEditTodayWorkLogCase } from "../member-edit-today-work-log.case";
import { memberEditTodayWorkLogOperators } from "../member-edit-today-work-log.operators";

test.describe("成员可以编辑当天已写好的日志测试用例", () => {
  test(memberEditTodayWorkLogCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(memberEditTodayWorkLogCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, MemberEditTodayWorkLogCaseData>(),
        memberEditTodayWorkLogOperators,
      ),
      testInfo,
    });
  });
});
