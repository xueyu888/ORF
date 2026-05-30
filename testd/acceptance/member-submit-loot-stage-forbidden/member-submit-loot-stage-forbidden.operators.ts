import { expect } from "@playwright/test";
import type { OperatorRegistry, StateCaseRuntime, StepParams } from "../../_framework/types";
import { readBrowserSession } from "../../_operators/common.helpers";
import { requiredString } from "../../_operators/params";
import type {
  MemberSubmitLootStageForbiddenCaseData,
  StageForbiddenResult,
  StageForbiddenTarget,
  TestContext,
} from "./_support/member-submit-loot-stage-forbidden.context";
import {
  asLootForbiddenResultFixture,
  asLootForbiddenTargetFixture,
  asStageResult,
  asStageTarget,
  createLootForbiddenResult,
  deleteTestLoot,
  deleteLootForbiddenResults,
  deleteLootForbiddenTargets,
  expectLootForbiddenTargetPanelsVisible,
  expectSubmitLootActionsAbsent,
  lootForbiddenResultsAbsent,
  lootForbiddenResultsPresent,
  lootForbiddenTargetsAbsent,
  lootForbiddenTargetsMatchFixtures,
  stageMemberWorkbenchContainsTargets,
  stageResultFixtures,
  stageTargetChallengers,
  stageTargetChallengersByTargetId,
  stageTargetFixtures,
  testLootAbsent,
  upsertLootForbiddenTarget,
} from "./_support/member-submit-loot-stage-forbidden.helpers";

export const memberSubmitLootStageForbiddenOperators = {
  "db.stage_loot_target": {
    delete_residue: async ({ data }) => {
      await deleteLootForbiddenTargets(stageTargetFixtures(data));
    },

    upsert: async ({ data, params }) =>
      upsertLootForbiddenTarget({
        fixture: asLootForbiddenTargetFixture(params.fixture),
        teamId: requiredString(params, "teamId"),
        challengers: stageTargetChallengers(data),
        createdBy: requiredString(params, "createdBy"),
        updatedBy: requiredString(params, "updatedBy"),
      }),

    states: async ({ data }) => {
      await expect
        .poll(() => lootForbiddenTargetsMatchFixtures(stageTargetFixtures(data), stageTargetChallengersByTargetId(data)))
        .toBe(true);
    },

    absent: async ({ data }) => {
      await expect.poll(() => lootForbiddenTargetsAbsent(stageTargetFixtures(data))).toBe(true);
    },
  },

  "db.stage_loot_result": {
    delete_residue: async ({ data }) => {
      await deleteLootForbiddenResults(stageResultFixtures(data));
    },

    create: async ({ params }) => createLootForbiddenResult(requiredStageTarget(params, "target"), asLootForbiddenResultFixture(params.result)),

    all_present: async ({ runtime }) => {
      await expect.poll(() => lootForbiddenResultsPresent(stageResultPairsFromRuntime(runtime))).toBe(true);
    },

    absent: async ({ data }) => {
      await expect.poll(() => lootForbiddenResultsAbsent(stageResultFixtures(data))).toBe(true);
    },
  },

  "db.stage_loot": {
    delete: async ({ params }) => {
      await deleteTestLoot(requiredString(params, "body"));
    },

    absent: async ({ params }) => {
      await expect.poll(() => testLootAbsent(requiredString(params, "body"))).toBe(true);
    },
  },

  "page.stage_loot_targets": {
    visible: async ({ ctx, data }) => {
      await expectLootForbiddenTargetPanelsVisible(ctx.page, stageTargetFixtures(data));
    },

    submit_action_absent: async ({ ctx, data }) => {
      await expectSubmitLootActionsAbsent(ctx.page, stageTargetFixtures(data));
    },
  },

  "page.stage_login": {
    submit_member: async ({ ctx, data }) => {
      await ctx.page.getByRole("button", { name: "Sign In" }).click();
      await expect
        .poll(() => readBrowserSession(ctx.page))
        .toMatchObject({
          status: 200,
          body: {
            authenticated: true,
            user: {
              email: data.email,
              role: data.role,
              status: "active",
            },
          },
        });
    },
  },

  "api.stage_member_workbench": {
    targets_present: async ({ ctx, data }) => {
      await expect.poll(() => stageMemberWorkbenchContainsTargets(ctx.page, data)).toBe(true);
    },
  },
} satisfies OperatorRegistry<TestContext, MemberSubmitLootStageForbiddenCaseData>;

function requiredStageTarget(params: StepParams, key: string): StageForbiddenTarget {
  return asStageTarget(params[key]);
}

function stageResultPairsFromRuntime(runtime: StateCaseRuntime) {
  return [
    {
      target: asStageTarget(runtime.values.resultClaimingTarget),
      result: asStageResult(runtime.values.resultClaimingResult),
    },
    {
      target: asStageTarget(runtime.values.reestimateTarget),
      result: asStageResult(runtime.values.reestimateResult),
    },
  ];
}
