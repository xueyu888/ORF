import { test } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import { createCommonOperators } from "../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../_operators/registry";
import type {
  AdminDeleteMemberReferencedForbiddenCaseData,
  TestContext,
} from "../_support/admin-delete-member-referenced-forbidden.context";
import { adminDeleteMemberReferencedForbiddenCase } from "../admin-delete-member-referenced-forbidden.case";
import { adminDeleteMemberReferencedForbiddenOperators } from "../admin-delete-member-referenced-forbidden.operators";

test.describe("管理员删除成员反向测试用例", () => {
  test(adminDeleteMemberReferencedForbiddenCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(adminDeleteMemberReferencedForbiddenCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, AdminDeleteMemberReferencedForbiddenCaseData>(),
        adminDeleteMemberReferencedForbiddenOperators,
      ),
      testInfo,
    });
  });
});
