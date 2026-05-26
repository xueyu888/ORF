import { test } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import { createCommonOperators } from "../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../_operators/registry";
import type { TestContext, ViewFinalScoreCaseData } from "../_support/view-final-score.context";
import { closeViewFinalScoreTestDb } from "../_support/view-final-score.helpers";
import { viewFinalScoreCase } from "../view-final-score.case";
import { viewFinalScoreOperators } from "../view-final-score.operators";

test.describe("查看最终分数测试用例", () => {
  test.afterAll(async () => {
    await closeViewFinalScoreTestDb();
  });

  test(viewFinalScoreCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(viewFinalScoreCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, ViewFinalScoreCaseData>(),
        viewFinalScoreOperators,
      ),
      testInfo,
    });
  });
});
