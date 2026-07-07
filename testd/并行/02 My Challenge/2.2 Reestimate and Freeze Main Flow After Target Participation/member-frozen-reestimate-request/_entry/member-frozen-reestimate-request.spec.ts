import { test } from "@playwright/test";
import { runStateCase } from "../../../../../_framework/runner";
import { createCommonOperators } from "../../../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../../../_operators/registry";
import {
  type MemberFrozenReestimateRequestCaseData,
  type TestContext,
} from "../_support/member-frozen-reestimate-request.context";
import { memberFrozenReestimateRequestCase } from "../member-frozen-reestimate-request.case";
import { memberFrozenReestimateRequestOperators } from "../member-frozen-reestimate-request.operators";

test.describe("普通成员在已冻结阶段填写重新重估理由后可申请重开重估测试用例", () => {
  test(memberFrozenReestimateRequestCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(memberFrozenReestimateRequestCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, MemberFrozenReestimateRequestCaseData>(),
        memberFrozenReestimateRequestOperators,
      ),
      testInfo,
    });
  });
});
