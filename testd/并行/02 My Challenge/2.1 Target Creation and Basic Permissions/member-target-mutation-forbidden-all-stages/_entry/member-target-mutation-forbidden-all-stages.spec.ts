import { test } from "@playwright/test";
import { runStateCase } from "../../../../../_framework/runner";
import { createCommonOperators } from "../../../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../../../_operators/registry";
import {
  type MemberTargetMutationForbiddenAllStagesCaseData,
  type TestContext,
} from "../_support/member-target-mutation-forbidden-all-stages.context";
import { memberTargetMutationForbiddenAllStagesCase } from "../member-target-mutation-forbidden-all-stages.case";
import { memberTargetMutationForbiddenAllStagesOperators } from "../member-target-mutation-forbidden-all-stages.operators";

test.describe("普通用户在任何阶段都不允许修改删除目标测试用例", () => {
  test(memberTargetMutationForbiddenAllStagesCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(memberTargetMutationForbiddenAllStagesCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, MemberTargetMutationForbiddenAllStagesCaseData>(),
        memberTargetMutationForbiddenAllStagesOperators,
      ),
      testInfo,
    });
  });
});
