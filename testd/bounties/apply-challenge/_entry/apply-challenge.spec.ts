import { test } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import { createCommonOperators } from "../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../_operators/registry";
import { applyChallengeCase } from "../apply-challenge.case";
import { applyChallengeOperators } from "../apply-challenge.operators";
import type { ApplyChallengeCaseData, TestContext } from "../_support/apply-challenge.context";

test.describe("悬赏大厅申请挑战测试用例", () => {
  test(applyChallengeCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(applyChallengeCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, ApplyChallengeCaseData>(),
        applyChallengeOperators,
      ),
      testInfo,
    });
  });
});
