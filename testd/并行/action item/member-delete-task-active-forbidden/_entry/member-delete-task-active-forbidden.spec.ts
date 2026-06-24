import { test } from "@playwright/test";
import { runStateCase } from "../../../../_framework/runner";
import { createCommonOperators } from "../../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../../_operators/registry";
import {
  type MemberDeleteTaskActiveForbiddenCaseData,
  type TestContext,
} from "../_support/member-delete-task-active-forbidden.context";
import { memberDeleteTaskActiveForbiddenCase } from "../member-delete-task-active-forbidden.case";
import { memberDeleteTaskActiveForbiddenOperators } from "../member-delete-task-active-forbidden.operators";

test.describe("非参与的普通成员在执行中不支持删除行动项测试用例", () => {
  test(memberDeleteTaskActiveForbiddenCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(memberDeleteTaskActiveForbiddenCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, MemberDeleteTaskActiveForbiddenCaseData>(),
        memberDeleteTaskActiveForbiddenOperators,
      ),
      testInfo,
    });
  });
});
