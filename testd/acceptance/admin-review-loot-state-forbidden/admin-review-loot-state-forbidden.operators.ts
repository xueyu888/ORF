import { expect } from "@playwright/test";
import type { OperatorRegistry, StepParams } from "../../_framework/types";
import { readBrowserSession } from "../../_operators/common.helpers";
import { requiredString } from "../../_operators/params";
import type {
  AdminReviewLootStateForbiddenCaseData,
  StateForbiddenLoot,
  StateForbiddenResult,
  StateForbiddenTarget,
  TestContext,
} from "./_support/admin-review-loot-state-forbidden.context";
import {
  adminWorkbenchContainsStateTargets,
  asReviewLootForbiddenLootFixture,
  asReviewLootForbiddenResultFixture,
  asReviewLootForbiddenTargetFixture,
  createReviewLootForbiddenLoot,
  createReviewLootForbiddenResult,
  deleteReviewLootForbiddenLedger,
  deleteReviewLootForbiddenLoots,
  deleteReviewLootForbiddenResults,
  deleteReviewLootForbiddenTargets,
  expectReviewLootActionsAbsent,
  expectReviewLootForbiddenTargetPanelsVisible,
  requireStateForbiddenLoot,
  requireStateForbiddenResult,
  requireStateForbiddenTarget,
  reviewLootForbiddenLedgerAbsent,
  reviewLootForbiddenLootPresent,
  reviewLootForbiddenLootsAbsent,
  reviewLootForbiddenResultPresent,
  reviewLootForbiddenResultsAbsent,
  reviewLootForbiddenTargetsAbsent,
  reviewLootForbiddenTargetsMatchFixtures,
  stateLedgerReasons,
  stateLootFixtures,
  stateResultFixtures,
  stateTargetChallengers,
  stateTargetChallengersByTargetId,
  stateTargetFixtures,
  upsertReviewLootForbiddenTarget,
} from "./_support/admin-review-loot-state-forbidden.helpers";

export const adminReviewLootStateForbiddenOperators = {
  "db.state_review_loot_target": {
    delete_residue: async ({ data }) => {
      await deleteReviewLootForbiddenTargets(stateTargetFixtures(data));
    },

    upsert: async ({ data, params }) =>
      upsertReviewLootForbiddenTarget({
        fixture: asReviewLootForbiddenTargetFixture(params.fixture),
        teamId: requiredString(params, "teamId"),
        challengers: stateTargetChallengers(data),
        createdBy: requiredString(params, "createdBy"),
        updatedBy: requiredString(params, "updatedBy"),
      }),

    states: async ({ data }) => {
      await expect
        .poll(() => reviewLootForbiddenTargetsMatchFixtures(stateTargetFixtures(data), stateTargetChallengersByTargetId(data)))
        .toBe(true);
    },

    absent: async ({ data }) => {
      await expect.poll(() => reviewLootForbiddenTargetsAbsent(stateTargetFixtures(data))).toBe(true);
    },
  },

  "db.state_review_loot_result": {
    delete_residue: async ({ data }) => {
      await deleteReviewLootForbiddenResults(stateResultFixtures(data));
    },

    create: async ({ params }) => createReviewLootForbiddenResult(
      requiredStateForbiddenTarget(params, "target"),
      asReviewLootForbiddenResultFixture(params.result),
    ),

    present: async ({ params }) => {
      await expect
        .poll(() =>
          reviewLootForbiddenResultPresent(
            requiredStateForbiddenTarget(params, "target"),
            requiredStateForbiddenResult(params, "result"),
          ),
        )
        .toBe(true);
    },

    absent: async ({ data }) => {
      await expect.poll(() => reviewLootForbiddenResultsAbsent(stateResultFixtures(data))).toBe(true);
    },
  },

  "db.state_review_loot": {
    delete_residue: async ({ data }) => {
      await deleteReviewLootForbiddenLoots(stateLootFixtures(data));
    },

    create: async ({ params }) => createReviewLootForbiddenLoot(
      requiredStateForbiddenTarget(params, "target"),
      requiredStateForbiddenResult(params, "result"),
      asReviewLootForbiddenLootFixture(params.loot),
    ),

    present: async ({ params }) => {
      await expect
        .poll(() =>
          reviewLootForbiddenLootPresent(
            requiredStateForbiddenTarget(params, "target"),
            requiredStateForbiddenLoot(params, "loot"),
            requiredStateForbiddenResult(params, "result"),
          ),
        )
        .toBe(true);
    },

    absent: async ({ data }) => {
      await expect.poll(() => reviewLootForbiddenLootsAbsent(stateLootFixtures(data))).toBe(true);
    },
  },

  "db.state_review_loot_ledger": {
    delete_residue: async ({ data }) => {
      await deleteReviewLootForbiddenLedger(stateLedgerReasons(data));
    },

    absent: async ({ data }) => {
      await expect.poll(() => reviewLootForbiddenLedgerAbsent(stateLedgerReasons(data))).toBe(true);
    },
  },

  "page.state_review_loot_login": {
    submit_admin: async ({ ctx, data }) => {
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

  "page.state_review_loot_targets": {
    visible: async ({ ctx, data }) => {
      await expectReviewLootForbiddenTargetPanelsVisible(ctx.page, stateTargetFixtures(data));
    },

    review_action_absent: async ({ ctx, data }) => {
      await expectReviewLootActionsAbsent(ctx.page, stateTargetFixtures(data));
    },
  },

  "api.state_review_loot_workbench": {
    targets_present: async ({ ctx, data }) => {
      await expect.poll(() => adminWorkbenchContainsStateTargets(ctx.page, data)).toBe(true);
    },
  },
} satisfies OperatorRegistry<TestContext, AdminReviewLootStateForbiddenCaseData>;

function requiredStateForbiddenTarget(params: StepParams, key: string): StateForbiddenTarget {
  return requireStateForbiddenTarget(params[key]);
}

function requiredStateForbiddenResult(params: StepParams, key: string): StateForbiddenResult {
  return requireStateForbiddenResult(params[key]);
}

function requiredStateForbiddenLoot(params: StepParams, key: string): StateForbiddenLoot {
  return requireStateForbiddenLoot(params[key]);
}
