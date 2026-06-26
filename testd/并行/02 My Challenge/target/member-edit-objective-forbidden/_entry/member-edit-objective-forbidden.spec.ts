import { test } from "@playwright/test";
import { runStateCase } from "../../../../../_framework/runner";
import { createCommonOperators } from "../../../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../../../_operators/registry";
import {
  type MemberEditObjectiveForbiddenCaseData,
  type TestContext,
} from "../_support/member-edit-objective-forbidden.context";
import { memberEditObjectiveForbiddenCase } from "../member-edit-objective-forbidden.case";
import { memberEditObjectiveForbiddenOperators } from "../member-edit-objective-forbidden.operators";

test.describe("非指挥官不允许进入编辑修改目标测试用例", () => {
  test(memberEditObjectiveForbiddenCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(memberEditObjectiveForbiddenCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, MemberEditObjectiveForbiddenCaseData>(),
        memberEditObjectiveForbiddenOperators,
      ),
      testInfo,
    });
  });
});
