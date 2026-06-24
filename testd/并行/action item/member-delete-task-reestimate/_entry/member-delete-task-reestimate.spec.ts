import { test } from "@playwright/test";
import { runStateCase } from "../../../../_framework/runner";
import { createCommonOperators } from "../../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../../_operators/registry";
import { memberDeleteTaskOperators } from "../../member-delete-task/member-delete-task.operators";
import {
  type MemberDeleteTaskReestimateCaseData,
  type TestContext,
} from "../_support/member-delete-task-reestimate.context";
import { memberDeleteTaskReestimateCase } from "../member-delete-task-reestimate.case";
import { memberDeleteTaskReestimateOperators } from "../member-delete-task-reestimate.operators";

test.describe("参与的普通成员在重估中支持删除行动项测试用例", () => {
  test(memberDeleteTaskReestimateCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(memberDeleteTaskReestimateCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, MemberDeleteTaskReestimateCaseData>(),
        memberDeleteTaskOperators,
        memberDeleteTaskReestimateOperators,
      ),
      testInfo,
    });
  });
});
