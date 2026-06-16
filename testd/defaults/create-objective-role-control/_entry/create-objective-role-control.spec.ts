import { test } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import { createCommonOperators } from "../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../_operators/registry";
import { createObjectiveRoleControlCase } from "../create-objective-role-control.case";
import { createObjectiveRoleControlOperators } from "../create-objective-role-control.operators";
import type { CreateObjectiveRoleControlCaseData, TestContext } from "../_support/create-objective-role-control.context";

test.describe("07-首页新建目标按角色控制测试用例", () => {
  test(createObjectiveRoleControlCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(createObjectiveRoleControlCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, CreateObjectiveRoleControlCaseData>(),
        createObjectiveRoleControlOperators,
      ),
      testInfo,
    });
  });
});
