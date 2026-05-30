import { test } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import { createCommonOperators } from "../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../_operators/registry";
import { commentOperators } from "../../comment.operators";
import type { CommentCaseData, TestContext } from "../../_support/comment.context";
import { memberCreateCommentCases } from "../member-create-comment.case";

test.describe("成员新增评论", () => {
  for (const testCase of memberCreateCommentCases) {
    test(testCase.title, async ({ context, page }, testInfo) => {
      const ctx: TestContext = { context, page };

      await runStateCase(testCase, ctx, {
        operators: mergeOperatorRegistries(
          createCommonOperators<TestContext, CommentCaseData>(),
          commentOperators,
        ),
        testInfo,
      });
    });
  }
});
