import { test } from "@playwright/test";
import { runStateCase } from "../../../../../_framework/runner";
import { createCommonOperators } from "../../../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../../../_operators/registry";
import {
  type MemberAcceptRecruitedChallengeCaseData,
  type TestContext,
} from "../_support/member-accept-recruited-challenge.context";
import { memberAcceptRecruitedChallengeCase } from "../member-accept-recruited-challenge.case";
import { memberAcceptRecruitedChallengeOperators } from "../member-accept-recruited-challenge.operators";

test.describe("被征召挑战者成功接受挑战测试用例", () => {
  test(memberAcceptRecruitedChallengeCase.title, async ({ context, page }, testInfo) => {
    test.setTimeout(120_000);
    const ctx: TestContext = { context, page };

    await runStateCase(memberAcceptRecruitedChallengeCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, MemberAcceptRecruitedChallengeCaseData>(),
        memberAcceptRecruitedChallengeOperators,
      ),
      testInfo,
    });
  });
});
