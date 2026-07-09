import { test } from "@playwright/test";
import { runStateCase } from "../../../../../_framework/runner";
import { createCommonOperators } from "../../../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../../../_operators/registry";
import {
  type MemberAcceptanceAlignmentRequestCaseData,
  type TestContext,
} from "../_support/member-acceptance-alignment-request.context";
import { memberAcceptanceAlignmentRequestCase } from "../member-acceptance-alignment-request.case";
import { memberAcceptanceAlignmentRequestOperators } from "../member-acceptance-alignment-request.operators";

test.describe("普通成员在待验收阶段可申请验收对齐测试用例", () => {
  test(memberAcceptanceAlignmentRequestCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(memberAcceptanceAlignmentRequestCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, MemberAcceptanceAlignmentRequestCaseData>(),
        memberAcceptanceAlignmentRequestOperators,
      ),
      testInfo,
    });
  });
});
