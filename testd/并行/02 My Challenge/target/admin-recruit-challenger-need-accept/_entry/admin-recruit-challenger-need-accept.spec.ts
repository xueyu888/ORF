import { test } from "@playwright/test";
import { runStateCase } from "../../../../../_framework/runner";
import { createCommonOperators } from "../../../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../../../_operators/registry";
import {
  type AdminRecruitChallengerNeedAcceptCaseData,
  type TestContext,
} from "../_support/admin-recruit-challenger-need-accept.context";
import { adminRecruitChallengerNeedAcceptCase } from "../admin-recruit-challenger-need-accept.case";
import { adminRecruitChallengerNeedAcceptOperators } from "../admin-recruit-challenger-need-accept.operators";

test.describe("管理员征召挑战者后被征召挑战者需接受挑战测试用例", () => {
  test(adminRecruitChallengerNeedAcceptCase.title, async ({ context, page }, testInfo) => {
    test.setTimeout(120_000);
    const ctx: TestContext = { context, page };

    await runStateCase(adminRecruitChallengerNeedAcceptCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, AdminRecruitChallengerNeedAcceptCaseData>(),
        adminRecruitChallengerNeedAcceptOperators,
      ),
      testInfo,
    });
  });
});
