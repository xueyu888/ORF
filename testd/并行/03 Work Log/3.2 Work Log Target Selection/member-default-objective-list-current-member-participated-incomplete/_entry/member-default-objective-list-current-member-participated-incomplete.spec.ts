import { test } from "@playwright/test";
import { runStateCase } from "../../../../../_framework/runner";
import { createCommonOperators } from "../../../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../../../_operators/registry";
import {
  type MemberDefaultObjectiveListCurrentMemberParticipatedIncompleteCaseData,
  type TestContext,
} from "../_support/member-default-objective-list-current-member-participated-incomplete.context";
import { memberDefaultObjectiveListCurrentMemberParticipatedIncompleteCase } from "../member-default-objective-list-current-member-participated-incomplete.case";
import { memberDefaultObjectiveListCurrentMemberParticipatedIncompleteOperators } from "../member-default-objective-list-current-member-participated-incomplete.operators";

test.describe("普通成员默认目标列表仅展示当前成员参与且未完成的目标测试用例", () => {
  test(memberDefaultObjectiveListCurrentMemberParticipatedIncompleteCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(memberDefaultObjectiveListCurrentMemberParticipatedIncompleteCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, MemberDefaultObjectiveListCurrentMemberParticipatedIncompleteCaseData>(),
        memberDefaultObjectiveListCurrentMemberParticipatedIncompleteOperators,
      ),
      testInfo,
    });
  });
});
