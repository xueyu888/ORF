import { test } from "@playwright/test";
import { runStateCase } from "../../../../../_framework/runner";
import { createCommonOperators } from "../../../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../../../_operators/registry";
import {
  type MemberPeerReviewSubmitCaseData,
  type TestContext,
} from "../_support/member-peer-review-submit.context";
import { memberPeerReviewSubmitCase } from "../member-peer-review-submit.case";
import { memberPeerReviewSubmitOperators } from "../member-peer-review-submit.operators";

test.describe("普通成员在已验收阶段可提交匿名互评测试用例", () => {
  test(memberPeerReviewSubmitCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(memberPeerReviewSubmitCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, MemberPeerReviewSubmitCaseData>(),
        memberPeerReviewSubmitOperators,
      ),
      testInfo,
    });
  });
});
