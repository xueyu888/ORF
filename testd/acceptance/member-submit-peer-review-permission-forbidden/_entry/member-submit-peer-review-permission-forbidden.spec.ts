import { test } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import { createCommonOperators } from "../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../_operators/registry";
import type {
  MemberSubmitPeerReviewPermissionForbiddenCaseData,
  TestContext,
} from "../_support/member-submit-peer-review-permission-forbidden.context";
import { memberSubmitPeerReviewPermissionForbiddenCase } from "../member-submit-peer-review-permission-forbidden.case";
import { memberSubmitPeerReviewPermissionForbiddenOperators } from "../member-submit-peer-review-permission-forbidden.operators";

test.describe("成员提交匿名互评-管理员和非参与成员不可互评测试用例", () => {
  test(memberSubmitPeerReviewPermissionForbiddenCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(memberSubmitPeerReviewPermissionForbiddenCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, MemberSubmitPeerReviewPermissionForbiddenCaseData>(),
        memberSubmitPeerReviewPermissionForbiddenOperators,
      ),
      testInfo,
    });
  });
});
