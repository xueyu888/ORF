import { test } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import { createCommonOperators } from "../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../_operators/registry";
import type { PersonalSettingsSavePersistenceCaseData, TestContext } from "../_support/personal-settings-save-persistence.context";
import { personalSettingsSavePersistenceCase } from "../personal-settings-save-persistence.case";
import { personalSettingsSavePersistenceOperators } from "../personal-settings-save-persistence.operators";

test.describe("20-个人设置保存后刷新和重新登录保留配置测试用例", () => {
  test(personalSettingsSavePersistenceCase.title, async ({ context, page }, testInfo) => {
    const ctx: TestContext = { context, page };

    await runStateCase(personalSettingsSavePersistenceCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<TestContext, PersonalSettingsSavePersistenceCaseData>(),
        personalSettingsSavePersistenceOperators,
      ),
      testInfo,
    });
  });
});
