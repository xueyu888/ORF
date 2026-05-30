import { test } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import { createCommonOperators } from "../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../_operators/registry";
import type {
  MemberManagementForbiddenCaseData,
  MemberManagementForbiddenTestContext,
} from "../../_support/member-management-forbidden.context";
import { memberManagementForbiddenOperators } from "../../_support/member-management-forbidden.operators";
import { adminDisableMemberForbiddenCase } from "../admin-disable-member-forbidden.case";

test.describe("管理员停用成员反向测试用例", () => {
  test(adminDisableMemberForbiddenCase.title, async ({ context, page }, testInfo) => {
    const ctx: MemberManagementForbiddenTestContext = { context, page };

    await runStateCase(adminDisableMemberForbiddenCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<MemberManagementForbiddenTestContext, MemberManagementForbiddenCaseData>(),
        memberManagementForbiddenOperators,
      ),
      testInfo,
    });
  });
});
