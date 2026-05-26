import { test } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import { createCommonOperators } from "../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../_operators/registry";
import type { MemberScoreStatisticsCaseData, TestContext } from "../_support/member-score-statistics.context";
import { closeMemberScoreStatisticsTestDb } from "../_support/member-score-statistics.helpers";
import { memberScoreStatisticsCase } from "../member-score-statistics.case";
import { memberScoreStatisticsOperators } from "../member-score-statistics.operators";

test.describe("成员分数统计测试用例", () => {
  test.afterAll(async () => {
    await closeMemberScoreStatisticsTestDb();
  });

  test(memberScoreStatisticsCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(memberScoreStatisticsCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, MemberScoreStatisticsCaseData>(),
        memberScoreStatisticsOperators,
      ),
      testInfo,
    });
  });
});
