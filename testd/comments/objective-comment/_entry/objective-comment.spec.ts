import { test } from "@playwright/test";
import { createCommonOperators } from "../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../_operators/registry";
import { runStateCase } from "../../../_framework/runner";
import { objectiveCommentCreateCase } from "../objective-comment.case";
import { objectiveCommentOperators } from "../objective-comment.operators";
import type { ObjectiveCommentCaseData, TestContext } from "../_support/objective-comment.context";

test.describe("目标新增评论测试用例", () => {
  test(objectiveCommentCreateCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(objectiveCommentCreateCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, ObjectiveCommentCaseData>(),
        objectiveCommentOperators,
      ),
      testInfo,
    });
  });
});
