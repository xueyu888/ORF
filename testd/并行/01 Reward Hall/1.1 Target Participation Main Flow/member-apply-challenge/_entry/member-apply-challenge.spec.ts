import { test } from "@playwright/test";
import { runStateCase } from "../../../../../_framework/runner";
import { createCommonOperators } from "../../../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../../../_operators/registry";
import {
  type MemberApplyChallengeCaseData,
  type TestContext,
} from "../_support/member-apply-challenge.context";
import { memberApplyChallengeCase } from "../member-apply-challenge.case";
import { memberApplyChallengeOperators } from "../member-apply-challenge.operators";

test.describe("非指挥官可以主动申请挑战测试用例", () => {
  test(memberApplyChallengeCase.title, async ({ context, page }, testInfo) => {
    test.setTimeout(120_000);
    const ctx: TestContext = { context, page };

    await runStateCase(memberApplyChallengeCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, MemberApplyChallengeCaseData>(),
        memberApplyChallengeOperators,
      ),
      testInfo,
    });
  });
});
