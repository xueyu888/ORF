import { test } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import { createCommonOperators } from "../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../_operators/registry";
import { objectiveCreateForbiddenCase } from "../objective-create-forbidden.case";
import { objectiveCreateForbiddenOperators } from "../objective-create-forbidden.operators";
import type { ObjectiveCreateForbiddenCaseData, TestContext } from "../_support/objective-create-forbidden.context";

test.describe("普通成员不可新增目标测试用例", () => {
  test(objectiveCreateForbiddenCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(objectiveCreateForbiddenCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, ObjectiveCreateForbiddenCaseData>(),
        objectiveCreateForbiddenOperators,
      ),
      testInfo,
    });
  });
});
