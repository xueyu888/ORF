import { test } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import { createCommonOperators } from "../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../_operators/registry";
import type { MemberCreateTaskCaseData, TestContext } from "../_support/member-create-task.context";
import { closeMemberCreateTaskTestDb } from "../_support/member-create-task.helpers";
import { memberCreateTaskCase } from "../member-create-task.case";
import { memberCreateTaskOperators } from "../member-create-task.operators";

test.describe("用户增加行动项和子行动项测试用例", () => {
  test.afterAll(async () => {
    await closeMemberCreateTaskTestDb();
  });

  test(memberCreateTaskCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(memberCreateTaskCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, MemberCreateTaskCaseData>(),
        memberCreateTaskOperators,
      ),
      testInfo,
    });
  });
});
