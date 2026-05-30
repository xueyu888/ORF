import { test } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import { createCommonOperators } from "../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../_operators/registry";
import type {
  MemberSubmitLootPermissionForbiddenCaseData,
  TestContext,
} from "../_support/member-submit-loot-permission-forbidden.context";
import { memberSubmitLootPermissionForbiddenCase } from "../member-submit-loot-permission-forbidden.case";
import { memberSubmitLootPermissionForbiddenOperators } from "../member-submit-loot-permission-forbidden.operators";

test.describe("成员提交战利品-管理员和非挑战成员不可提交测试用例", () => {
  test(memberSubmitLootPermissionForbiddenCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(memberSubmitLootPermissionForbiddenCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, MemberSubmitLootPermissionForbiddenCaseData>(),
        memberSubmitLootPermissionForbiddenOperators,
      ),
      testInfo,
    });
  });
});
