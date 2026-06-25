import { test } from "@playwright/test";
import { runStateCase } from "../../../../../_framework/runner";
import { createCommonOperators } from "../../../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../../../_operators/registry";
import type { MemberDeleteTaskCaseData, TestContext } from "../_support/member-delete-task.context";
import { memberDeleteTaskCase } from "../member-delete-task.case";
import { memberDeleteTaskOperators } from "../member-delete-task.operators";

test.describe("参与的普通成员在执行中支持删除行动项测试用例", () => {
  test(memberDeleteTaskCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(memberDeleteTaskCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, MemberDeleteTaskCaseData>(),
        memberDeleteTaskOperators,
      ),
      testInfo,
    });
  });
});
