import { test } from "@playwright/test";
import { runStateCase } from "../../../../../_framework/runner";
import { createCommonOperators } from "../../../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../../../_operators/registry";
import {
  type MemberReestimateMetricActionPermissionsCaseData,
  type TestContext,
} from "../_support/member-reestimate-metric-action-permissions.context";
import { memberReestimateMetricActionPermissionsCase } from "../member-reestimate-metric-action-permissions.case";
import { memberReestimateMetricActionPermissionsOperators } from "../member-reestimate-metric-action-permissions.operators";

test.describe("参与的普通成员在重估中阶段可新增修改指标可新增修改删除行动项但不可删除指标测试用例", () => {
  test(memberReestimateMetricActionPermissionsCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(memberReestimateMetricActionPermissionsCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, MemberReestimateMetricActionPermissionsCaseData>(),
        memberReestimateMetricActionPermissionsOperators,
      ),
      testInfo,
    });
  });
});
