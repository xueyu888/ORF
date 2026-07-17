import { test } from "@playwright/test";
import { runStateCase } from "../../../../../_framework/runner";
import { createCommonOperators } from "../../../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../../../_operators/registry";
import {
  type MemberCreateTargetForbiddenCaseData,
  type TestContext,
} from "../_support/member-create-target-forbidden.context";
import { memberCreateTargetForbiddenCase } from "../member-create-target-forbidden.case";
import { memberCreateTargetForbiddenOperators } from "../member-create-target-forbidden.operators";

test.describe("普通用户不允许新建目标测试用例", () => {
  test(memberCreateTargetForbiddenCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(memberCreateTargetForbiddenCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, MemberCreateTargetForbiddenCaseData>(),
        memberCreateTargetForbiddenOperators,
      ),
      testInfo,
    });
  });
});
