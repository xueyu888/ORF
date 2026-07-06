import { test } from "@playwright/test";
import { runStateCase } from "../../../../../_framework/runner";
import { createCommonOperators } from "../../../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../../../_operators/registry";
import {
  type AdminDefaultObjectiveListAllAttachableTeamObjectivesCaseData,
  type TestContext,
} from "../_support/admin-default-objective-list-all-attachable-team-objectives.context";
import { adminDefaultObjectiveListAllAttachableTeamObjectivesCase } from "../admin-default-objective-list-all-attachable-team-objectives.case";
import { adminDefaultObjectiveListAllAttachableTeamObjectivesOperators } from "../admin-default-objective-list-all-attachable-team-objectives.operators";

test.describe("管理员默认目标列表可展示当前团队全部可挂载目标测试用例", () => {
  test(adminDefaultObjectiveListAllAttachableTeamObjectivesCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(adminDefaultObjectiveListAllAttachableTeamObjectivesCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, AdminDefaultObjectiveListAllAttachableTeamObjectivesCaseData>(),
        adminDefaultObjectiveListAllAttachableTeamObjectivesOperators,
      ),
      testInfo,
    });
  });
});
