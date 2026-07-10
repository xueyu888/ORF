import { test } from "@playwright/test";
import { runStateCase } from "../../../../../_framework/runner";
import { createCommonOperators } from "../../../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../../../_operators/registry";
import {
  type MemberFrozenReestimateMissingReasonCaseData,
  type TestContext,
} from "../_support/member-frozen-reestimate-missing-reason.context";
import { memberFrozenReestimateMissingReasonCase } from "../member-frozen-reestimate-missing-reason.case";
import { memberFrozenReestimateMissingReasonOperators } from "../member-frozen-reestimate-missing-reason.operators";

test.describe("普通成员在已冻结阶段未填写重新重估理由时不可提交重开重估申请测试用例", () => {
  test(memberFrozenReestimateMissingReasonCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(memberFrozenReestimateMissingReasonCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, MemberFrozenReestimateMissingReasonCaseData>(),
        memberFrozenReestimateMissingReasonOperators,
      ),
      testInfo,
    });
  });
});
