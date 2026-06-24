import { test } from "@playwright/test";
import { runStateCase } from "../../../../_framework/runner";
import { createCommonOperators } from "../../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../../_operators/registry";
import {
  type MemberDeleteTaskReestimateForbiddenCaseData,
  type TestContext,
} from "../_support/member-delete-task-reestimate-forbidden.context";
import { memberDeleteTaskReestimateForbiddenCase } from "../member-delete-task-reestimate-forbidden.case";
import { memberDeleteTaskReestimateForbiddenOperators } from "../member-delete-task-reestimate-forbidden.operators";

test.describe("非参与的普通成员在重估中不支持删除行动项测试用例", () => {
  test(memberDeleteTaskReestimateForbiddenCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(memberDeleteTaskReestimateForbiddenCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, MemberDeleteTaskReestimateForbiddenCaseData>(),
        memberDeleteTaskReestimateForbiddenOperators,
      ),
      testInfo,
    });
  });
});
