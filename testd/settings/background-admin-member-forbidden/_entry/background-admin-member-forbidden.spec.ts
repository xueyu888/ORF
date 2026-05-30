import { test } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import { createCommonOperators } from "../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../_operators/registry";
import { createBackgroundSettingsOperators } from "../../_support/background-settings.operators";
import type { BackgroundSettingsTestContext } from "../../_support/background-settings.context";
import { backgroundAdminMemberForbiddenCase } from "../background-admin-member-forbidden.case";

type BackgroundAdminMemberForbiddenCaseData = typeof backgroundAdminMemberForbiddenCase.data;

test.describe("系统背景普通成员反向测试用例", () => {
  test(backgroundAdminMemberForbiddenCase.title, async ({ context, page }, testInfo) => {
    const ctx: BackgroundSettingsTestContext = { context, page };

    await runStateCase(backgroundAdminMemberForbiddenCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<BackgroundSettingsTestContext, BackgroundAdminMemberForbiddenCaseData>(),
        createBackgroundSettingsOperators<BackgroundAdminMemberForbiddenCaseData>(),
      ),
      testInfo,
    });
  });
});
