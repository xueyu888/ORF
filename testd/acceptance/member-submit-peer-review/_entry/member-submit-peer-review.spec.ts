import { test } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import { createCommonOperators } from "../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../_operators/registry";
import type { MemberSubmitPeerReviewCaseData, TestContext } from "../_support/member-submit-peer-review.context";
import { closeMemberSubmitPeerReviewTestDb } from "../_support/member-submit-peer-review.helpers";
import { memberSubmitPeerReviewCase } from "../member-submit-peer-review.case";
import { memberSubmitPeerReviewOperators } from "../member-submit-peer-review.operators";

test.describe("成员提交匿名互评测试用例", () => {
  test.afterAll(async () => {
    await closeMemberSubmitPeerReviewTestDb();
  });

  test(memberSubmitPeerReviewCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(memberSubmitPeerReviewCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, MemberSubmitPeerReviewCaseData>(),
        memberSubmitPeerReviewOperators,
      ),
      testInfo,
    });
  });
});
