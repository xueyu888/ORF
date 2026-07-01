import { test } from "@playwright/test";
import { runStateCase } from "../../../../../_framework/runner";
import { createCommonOperators } from "../../../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../../../_operators/registry";
import {
  type DefaultObjectiveListCurrentMemberParticipatedIncompleteCaseData,
  type TestContext,
} from "../_support/default-objective-list-current-member-participated-incomplete.context";
import { defaultObjectiveListCurrentMemberParticipatedIncompleteCase } from "../default-objective-list-current-member-participated-incomplete.case";
import { defaultObjectiveListCurrentMemberParticipatedIncompleteOperators } from "../default-objective-list-current-member-participated-incomplete.operators";

test.describe("默认目标列表仅展示当前成员参与且未完成的目标测试用例", () => {
  test(defaultObjectiveListCurrentMemberParticipatedIncompleteCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(defaultObjectiveListCurrentMemberParticipatedIncompleteCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, DefaultObjectiveListCurrentMemberParticipatedIncompleteCaseData>(),
        defaultObjectiveListCurrentMemberParticipatedIncompleteOperators,
      ),
      testInfo,
    });
  });
});
