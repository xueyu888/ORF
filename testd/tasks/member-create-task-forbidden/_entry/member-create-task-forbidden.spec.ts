import { test } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import { createCommonOperators } from "../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../_operators/registry";
import type { MemberCreateTaskForbiddenCaseData, TestContext } from "../_support/member-create-task-forbidden.context";
import { memberCreateTaskForbiddenCase } from "../member-create-task-forbidden.case";
import { memberCreateTaskForbiddenOperators } from "../member-create-task-forbidden.operators";

test.describe("用户增加行动项和子行动项-无权限用户不可增加测试用例", () => {
  test(memberCreateTaskForbiddenCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(memberCreateTaskForbiddenCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, MemberCreateTaskForbiddenCaseData>(),
        memberCreateTaskForbiddenOperators,
      ),
      testInfo,
    });
  });
});
