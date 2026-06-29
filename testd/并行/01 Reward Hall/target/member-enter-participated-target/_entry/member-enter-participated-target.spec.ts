import { test } from "@playwright/test";
import { runStateCase } from "../../../../../_framework/runner";
import { createCommonOperators } from "../../../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../../../_operators/registry";
import {
  type MemberEnterParticipatedTargetCaseData,
  type TestContext,
} from "../_support/member-enter-participated-target.context";
import { memberEnterParticipatedTargetCase } from "../member-enter-participated-target.case";
import { memberEnterParticipatedTargetOperators } from "../member-enter-participated-target.operators";

test.describe("普通成员对已参与目标可进入并查看测试用例", () => {
  test(memberEnterParticipatedTargetCase.title, async ({ context, page }, testInfo) => {
    test.setTimeout(120_000);
    const ctx: TestContext = { context, page };

    await runStateCase(memberEnterParticipatedTargetCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, MemberEnterParticipatedTargetCaseData>(),
        memberEnterParticipatedTargetOperators,
      ),
      testInfo,
    });
  });
});
