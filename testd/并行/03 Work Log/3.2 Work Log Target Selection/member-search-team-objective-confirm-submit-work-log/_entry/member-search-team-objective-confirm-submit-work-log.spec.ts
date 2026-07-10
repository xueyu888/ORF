import { test } from "@playwright/test";
import { runStateCase } from "../../../../../_framework/runner";
import { createCommonOperators } from "../../../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../../../_operators/registry";
import {
  type MemberSearchTeamObjectiveConfirmSubmitWorkLogCaseData,
  type TestContext,
} from "../_support/member-search-team-objective-confirm-submit-work-log.context";
import { memberSearchTeamObjectiveConfirmSubmitWorkLogCase } from "../member-search-team-objective-confirm-submit-work-log.case";
import { memberSearchTeamObjectiveConfirmSubmitWorkLogOperators } from "../member-search-team-objective-confirm-submit-work-log.operators";

test.describe("普通成员可通过搜索选择团队内目标并确认提交日志测试用例", () => {
  test(memberSearchTeamObjectiveConfirmSubmitWorkLogCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(memberSearchTeamObjectiveConfirmSubmitWorkLogCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, MemberSearchTeamObjectiveConfirmSubmitWorkLogCaseData>(),
        memberSearchTeamObjectiveConfirmSubmitWorkLogOperators,
      ),
      testInfo,
    });
  });
});
