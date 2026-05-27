import { test } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import { createCommonOperators } from "../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../_operators/registry";
import type { MemberProposeResultCaseData, TestContext } from "../_support/member-propose-result.context";
import { memberProposeResultCase } from "../member-propose-result.case";
import { memberProposeResultOperators } from "../member-propose-result.operators";

test.describe("成员提出指标测试用例", () => {
  test(memberProposeResultCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(memberProposeResultCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, MemberProposeResultCaseData>(),
        memberProposeResultOperators,
      ),
      testInfo,
    });
  });
});
