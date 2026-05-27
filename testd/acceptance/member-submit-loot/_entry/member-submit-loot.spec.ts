import { test } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import { createCommonOperators } from "../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../_operators/registry";
import type { MemberSubmitLootCaseData, TestContext } from "../_support/member-submit-loot.context";
import { memberSubmitLootCase } from "../member-submit-loot.case";
import { memberSubmitLootOperators } from "../member-submit-loot.operators";

test.describe("成员提交战利品测试用例", () => {
  test(memberSubmitLootCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(memberSubmitLootCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, MemberSubmitLootCaseData>(),
        memberSubmitLootOperators,
      ),
      testInfo,
    });
  });
});
