import { test } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import { createCommonOperators } from "../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../_operators/registry";
import type { CommentCaseData, TestContext } from "../../_support/comment.context";
import { commentOperators } from "../../comment.operators";
import { commentReplyForbiddenCases } from "../comment-reply-forbidden.case";

test.describe("评论回复反向测试用例", () => {
  test.setTimeout(90_000);

  for (const testCase of commentReplyForbiddenCases) {
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
