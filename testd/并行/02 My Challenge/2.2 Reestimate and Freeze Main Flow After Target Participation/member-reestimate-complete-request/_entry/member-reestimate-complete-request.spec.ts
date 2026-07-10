import { test } from "@playwright/test";
import { runStateCase } from "../../../../../_framework/runner";
import { createCommonOperators } from "../../../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../../../_operators/registry";
import {
  type MemberReestimateCompleteRequestCaseData,
  type TestContext,
} from "../_support/member-reestimate-complete-request.context";
import { memberReestimateCompleteRequestCase } from "../member-reestimate-complete-request.case";
import { memberReestimateCompleteRequestOperators } from "../member-reestimate-complete-request.operators";

test.describe("参与的普通成员可在重估中阶段维护指标口径和等级积分并申请完成重估测试用例", () => {
  test(memberReestimateCompleteRequestCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(memberReestimateCompleteRequestCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, MemberReestimateCompleteRequestCaseData>(),
        memberReestimateCompleteRequestOperators,
      ),
      testInfo,
    });
  });
});
