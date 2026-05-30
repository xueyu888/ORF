import { test } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import { createCommonOperators } from "../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../_operators/registry";
import { objectivePublishMemberForbiddenCase } from "../objective-publish-member-forbidden.case";
import { objectivePublishMemberForbiddenOperators } from "../objective-publish-member-forbidden.operators";
import type {
  ObjectivePublishMemberForbiddenCaseData,
  TestContext,
} from "../_support/objective-publish-member-forbidden.context";

test.describe("普通成员不可新增并发布目标测试用例", () => {
  test(objectivePublishMemberForbiddenCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(objectivePublishMemberForbiddenCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, ObjectivePublishMemberForbiddenCaseData>(),
        objectivePublishMemberForbiddenOperators,
      ),
      testInfo,
    });
  });
});
