import { test } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import { createCommonOperators } from "../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../_operators/registry";
import type {
  MemberSubmitPeerReviewStateForbiddenCaseData,
  TestContext,
} from "../_support/member-submit-peer-review-state-forbidden.context";
import { memberSubmitPeerReviewStateForbiddenCase } from "../member-submit-peer-review-state-forbidden.case";
import { memberSubmitPeerReviewStateForbiddenOperators } from "../member-submit-peer-review-state-forbidden.operators";

test.describe("成员提交匿名互评-非待验收状态不可互评测试用例", () => {
  test(memberSubmitPeerReviewStateForbiddenCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(memberSubmitPeerReviewStateForbiddenCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, MemberSubmitPeerReviewStateForbiddenCaseData>(),
        memberSubmitPeerReviewStateForbiddenOperators,
      ),
      testInfo,
    });
  });
});
