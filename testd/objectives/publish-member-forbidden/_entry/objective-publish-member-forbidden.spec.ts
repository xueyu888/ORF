import { test, type TestInfo } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import { createTestInstanceSlug } from "../../../_framework/test-instance";
import type { StateCaseSpec } from "../../../_framework/types";
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
    const testCase = createObjectivePublishMemberForbiddenRunCase(testInfo);

    await runStateCase(testCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, ObjectivePublishMemberForbiddenCaseData>(),
        objectivePublishMemberForbiddenOperators,
      ),
      testInfo,
    });
  });
});

function createObjectivePublishMemberForbiddenRunCase(
  testInfo: TestInfo,
): StateCaseSpec<ObjectivePublishMemberForbiddenCaseData> {
  const suffix = createTestInstanceSlug(testInfo);

  return {
    ...objectivePublishMemberForbiddenCase,
    data: {
      ...objectivePublishMemberForbiddenCase.data,
      email: `orf-member-objective-publish-forbidden-${suffix}-e2e@orf.local`,
      objectiveTitle: `E2E-OBJECTIVE-PUBLISH-FORBIDDEN-${suffix}: 普通成员不可新增并发布目标`,
    },
  };
}
