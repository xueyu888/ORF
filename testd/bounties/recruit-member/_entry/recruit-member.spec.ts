import { test } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import { createCommonOperators } from "../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../_operators/registry";
import type { RecruitMemberCaseData, TestContext } from "../_support/recruit-member.context";
import { recruitMemberCase } from "../recruit-member.case";
import { recruitMemberOperators } from "../recruit-member.operators";

test.describe("管理员征召成员执行目标测试用例", () => {
  test(recruitMemberCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(recruitMemberCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, RecruitMemberCaseData>(),
        recruitMemberOperators,
      ),
      testInfo,
    });
  });
});
