import { test } from "@playwright/test";
import { runStateCase } from "../../../../../_framework/runner";
import { createCommonOperators } from "../../../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../../../_operators/registry";
import {
  type MemberReapplyReestimateAfterRejectCaseData,
  type TestContext,
} from "../_support/member-reapply-reestimate-after-reject.context";
import { memberReapplyReestimateAfterRejectCase } from "../member-reapply-reestimate-after-reject.case";
import { memberReapplyReestimateAfterRejectOperators } from "../member-reapply-reestimate-after-reject.operators";

test.describe("普通成员被打回重估后校准积分并可再次申请完成重估测试用例", () => {
  test(memberReapplyReestimateAfterRejectCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(memberReapplyReestimateAfterRejectCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, MemberReapplyReestimateAfterRejectCaseData>(),
        memberReapplyReestimateAfterRejectOperators,
      ),
      testInfo,
    });
  });
});
