import { test } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import { createCommonOperators } from "../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../_operators/registry";
import type { FrozenMemberProposalCaseData, TestContext } from "../_support/member-cannot-propose-result-frozen.context";
import { memberCannotProposeResultFrozenCase } from "../member-cannot-propose-result-frozen.case";
import { memberCannotProposeResultFrozenOperators } from "../member-cannot-propose-result-frozen.operators";

test.describe("实施阶段成员不可提出指标测试用例", () => {
  test(memberCannotProposeResultFrozenCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(memberCannotProposeResultFrozenCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, FrozenMemberProposalCaseData>(),
        memberCannotProposeResultFrozenOperators,
      ),
      testInfo,
    });
  });
});
