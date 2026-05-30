import { test } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import { createCommonOperators } from "../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../_operators/registry";
import type {
  MemberSubmitLootStageForbiddenCaseData,
  TestContext,
} from "../_support/member-submit-loot-stage-forbidden.context";
import { memberSubmitLootStageForbiddenCase } from "../member-submit-loot-stage-forbidden.case";
import { memberSubmitLootStageForbiddenOperators } from "../member-submit-loot-stage-forbidden.operators";

test.describe("成员提交战利品-发布和评估阶段不可提交测试用例", () => {
  test(memberSubmitLootStageForbiddenCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(memberSubmitLootStageForbiddenCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, MemberSubmitLootStageForbiddenCaseData>(),
        memberSubmitLootStageForbiddenOperators,
      ),
      testInfo,
    });
  });
});
