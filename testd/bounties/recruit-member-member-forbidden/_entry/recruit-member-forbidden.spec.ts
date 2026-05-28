import { test } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import { createCommonOperators } from "../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../_operators/registry";
import type { RecruitMemberForbiddenCaseData, TestContext } from "../_support/recruit-member-forbidden.context";
import { recruitMemberForbiddenCase } from "../recruit-member-forbidden.case";
import { recruitMemberForbiddenOperators } from "../recruit-member-forbidden.operators";
import { recruitMemberOperators } from "../../recruit-member/recruit-member.operators";

test.describe("管理员征召成员执行目标-普通成员不可征召成员测试用例", () => {
  test(recruitMemberForbiddenCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(recruitMemberForbiddenCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, RecruitMemberForbiddenCaseData>(),
        recruitMemberOperators,
        recruitMemberForbiddenOperators,
      ),
      testInfo,
    });
  });
});
