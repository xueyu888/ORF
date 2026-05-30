import { test } from "@playwright/test";
import { runStateCase } from "../../../_framework/runner";
import { createCommonOperators } from "../../../_operators/common.operators";
import { mergeOperatorRegistries } from "../../../_operators/registry";
import { createBackgroundSettingsOperators } from "../../_support/background-settings.operators";
import type { BackgroundSettingsTestContext } from "../../_support/background-settings.context";
import { backgroundPersonalUnauthenticatedCase } from "../background-personal-unauthenticated.case";

type BackgroundPersonalUnauthenticatedCaseData = typeof backgroundPersonalUnauthenticatedCase.data;

test.describe("个人背景未登录反向测试用例", () => {
  test(backgroundPersonalUnauthenticatedCase.title, async ({ context, page }, testInfo) => {
    const ctx: BackgroundSettingsTestContext = { context, page };

    await runStateCase(backgroundPersonalUnauthenticatedCase, ctx, {
      operators: mergeOperatorRegistries(
        createCommonOperators<BackgroundSettingsTestContext, BackgroundPersonalUnauthenticatedCaseData>(),
        createBackgroundSettingsOperators<BackgroundPersonalUnauthenticatedCaseData>(),
      ),
      testInfo,
    });
  });
});
