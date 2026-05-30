import { test } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import { createCommonOperators } from "../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../_operators/registry";
import type {
  MemberPermissionForbiddenCaseData,
  TestContext,
} from "../_support/member-permission-forbidden.context";
import { memberPermissionForbiddenCase } from "../member-permission-forbidden.case";
import { memberPermissionForbiddenOperators } from "../member-permission-forbidden.operators";

test.describe("管理员修改 member 权限反向测试用例", () => {
  test(memberPermissionForbiddenCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(memberPermissionForbiddenCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, MemberPermissionForbiddenCaseData>(),
        memberPermissionForbiddenOperators,
      ),
      testInfo,
    });
  });
});
