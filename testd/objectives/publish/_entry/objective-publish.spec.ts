import { test } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import { createCommonOperators } from "../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../_operators/registry";
import type { ObjectivePublishCaseData, TestContext } from "../_support/objective-publish.context";
import { objectivePublishCase } from "../objective-publish.case";
import { objectivePublishOperators } from "../objective-publish.operators";

test.describe("管理员新增并发布目标测试用例", () => {
  test(objectivePublishCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(objectivePublishCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, ObjectivePublishCaseData>(),
        objectivePublishOperators,
      ),
      testInfo,
    });
  });
});
