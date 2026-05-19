import { test } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import { objectiveCommentCreateCase } from "../objective-comment.case";
import { objectiveCommentOperators } from "../objective-comment.operators";
import type { TestContext } from "../_support/objective-comment.context";
import { closeObjectiveCommentTestDb } from "../_support/objective-comment.helpers";

test.describe("目标新增评论测试用例", () => {
  test.afterAll(async () => {
    await closeObjectiveCommentTestDb();
  });

  test(objectiveCommentCreateCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(objectiveCommentCreateCase, ctx, {
      operators: objectiveCommentOperators,
      testInfo,
    });
  });
});
