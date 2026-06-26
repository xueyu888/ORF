import { test } from "@playwright/test";
import { runStateCase } from "../../../../../_framework/runner";
import { createCommonOperators } from "../../../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../../../_operators/registry";
import {
  type AdminCreateTargetPublishCaseData,
  type TestContext,
} from "../_support/admin-create-target-publish.context";
import { adminCreateTargetPublishCase } from "../admin-create-target-publish.case";
import { adminCreateTargetPublishOperators } from "../admin-create-target-publish.operators";

test.describe("管理员可以新建目标并发布测试用例", () => {
  test(adminCreateTargetPublishCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(adminCreateTargetPublishCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, AdminCreateTargetPublishCaseData>(),
        adminCreateTargetPublishOperators,
      ),
      testInfo,
    });
  });
});
