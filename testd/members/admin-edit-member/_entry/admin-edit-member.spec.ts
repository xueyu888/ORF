import { test, type TestInfo } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import type { StateCaseSpec } from "../../../_framework/types";
import { createTestInstanceSlug } from "../../../_framework/test-instance";
import { createCommonOperators } from "../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../_operators/registry";
import type { AdminEditMemberCaseData, TestContext } from "../_support/admin-edit-member.context";
import { adminEditMemberCase } from "../admin-edit-member.case";
import { adminEditMemberOperators } from "../admin-edit-member.operators";

test.describe("管理员编辑成员测试用例", () => {
  test(adminEditMemberCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };
    const testCase = createAdminEditMemberRunCase(testInfo);

    await runStateCase(testCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, AdminEditMemberCaseData>(),
        adminEditMemberOperators,
      ),
      testInfo,
    });
  });
});

function createAdminEditMemberRunCase(testInfo: TestInfo): StateCaseSpec<AdminEditMemberCaseData> {
  const suffix = createTestInstanceSlug(testInfo);
  const originalEmail = `orf-member-edit-source-${suffix}-e2e@orf.local`;
  const updatedEmail = `orf-member-edit-updated-${suffix}-e2e@orf.local`;

  return {
    ...adminEditMemberCase,
    data: {
      ...adminEditMemberCase.data,
      adminEmail: `orf-admin-edit-member-${suffix}-e2e@orf.local`,
      targetUserId: `user-testd-admin-edit-member-${suffix}`,
      originalEmail,
      updatedEmail,
      targetEmails: [originalEmail, updatedEmail],
    },
  };
}
