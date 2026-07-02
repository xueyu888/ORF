import { test } from "@playwright/test";
import { runStateCase } from "../../../../../_framework/runner";
import { createCommonOperators } from "../../../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../../../_operators/registry";
import {
  type MemberSearchNonParticipantObjectiveSubmitWorkLogCaseData,
  type TestContext,
} from "../_support/member-search-non-participant-objective-submit-work-log.context";
import { memberSearchNonParticipantObjectiveSubmitWorkLogCase } from "../member-search-non-participant-objective-submit-work-log.case";
import { memberSearchNonParticipantObjectiveSubmitWorkLogOperators } from "../member-search-non-participant-objective-submit-work-log.operators";

test.describe("成员可通过搜索选择团队内非参与目标并确认提交日志测试用例", () => {
  test(memberSearchNonParticipantObjectiveSubmitWorkLogCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(memberSearchNonParticipantObjectiveSubmitWorkLogCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, MemberSearchNonParticipantObjectiveSubmitWorkLogCaseData>(),
        memberSearchNonParticipantObjectiveSubmitWorkLogOperators,
      ),
      testInfo,
    });
  });
});
