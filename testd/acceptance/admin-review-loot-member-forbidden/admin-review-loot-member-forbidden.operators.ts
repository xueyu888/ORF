import { expect } from "@playwright/test";
import type { OperatorRegistry, StepParams } from "../../_framework/types";
import { readBrowserSession } from "../../_operators/common.helpers";
import { requiredString } from "../../_operators/params";
import type {
  AdminReviewLootMemberForbiddenCaseData,
  MemberForbiddenLoot,
  MemberForbiddenResult,
  MemberForbiddenTarget,
  TestContext,
} from "./_support/admin-review-loot-member-forbidden.context";
import {
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
  memberLedgerReasons,
  memberLootFixtures,
  memberResultFixtures,
  memberTargetChallengers,
  memberTargetChallengersByTargetId,
  memberTargetFixtures,
  memberWorkbenchContainsTarget,
  requireMemberForbiddenLoot,
  requireMemberForbiddenResult,
  requireMemberForbiddenTarget,
  reviewLootForbiddenLedgerAbsent,
  reviewLootForbiddenLootPresent,
  reviewLootForbiddenLootsAbsent,
  reviewLootForbiddenResultPresent,
  reviewLootForbiddenResultUnreviewed,
  reviewLootForbiddenResultsAbsent,
  reviewLootForbiddenTargetMatchesFixture,
  reviewLootForbiddenTargetsAbsent,
  reviewLootForbiddenTargetsMatchFixtures,
  upsertReviewLootForbiddenTarget,
} from "./_support/admin-review-loot-member-forbidden.helpers";

export const adminReviewLootMemberForbiddenOperators = {
  "db.member_review_loot_target": {
    delete_residue: async ({ data }) => {
      await deleteReviewLootForbiddenTargets(memberTargetFixtures(data));
    },

    upsert: async ({ data, params }) =>
      upsertReviewLootForbiddenTarget({
        fixture: asReviewLootForbiddenTargetFixture(params.fixture),
        teamId: requiredString(params, "teamId"),
        challengers: memberTargetChallengers(data),
        createdBy: requiredString(params, "createdBy"),
        updatedBy: requiredString(params, "updatedBy"),
      }),

    submitted: async ({ data, params }) => {
      await expect
        .poll(() =>
          reviewLootForbiddenTargetMatchesFixture(
            asReviewLootForbiddenTargetFixture(params.fixture),
            memberTargetChallengers(data),
          ),
        )
        .toBe(true);
    },

    states: async ({ data }) => {
      await expect
        .poll(() => reviewLootForbiddenTargetsMatchFixtures(memberTargetFixtures(data), memberTargetChallengersByTargetId(data)))
        .toBe(true);
    },

    absent: async ({ data }) => {
      await expect.poll(() => reviewLootForbiddenTargetsAbsent(memberTargetFixtures(data))).toBe(true);
    },
  },

  "db.member_review_loot_result": {
    delete_residue: async ({ data }) => {
      await deleteReviewLootForbiddenResults(memberResultFixtures(data));
    },

    create: async ({ params }) => createReviewLootForbiddenResult(
      requiredMemberForbiddenTarget(params, "target"),
      asReviewLootForbiddenResultFixture(params.result),
    ),

    present: async ({ params }) => {
      await expect
        .poll(() =>
          reviewLootForbiddenResultPresent(
            requiredMemberForbiddenTarget(params, "target"),
            requiredMemberForbiddenResult(params, "result"),
          ),
        )
        .toBe(true);
    },

    unreviewed: async ({ params }) => {
      await expect.poll(() => reviewLootForbiddenResultUnreviewed(requiredMemberForbiddenResult(params, "result"))).toBe(true);
    },

    absent: async ({ data }) => {
      await expect.poll(() => reviewLootForbiddenResultsAbsent(memberResultFixtures(data))).toBe(true);
    },
  },

  "db.member_review_loot": {
    delete_residue: async ({ data }) => {
      await deleteReviewLootForbiddenLoots(memberLootFixtures(data));
    },

    create: async ({ params }) => createReviewLootForbiddenLoot(
      requiredMemberForbiddenTarget(params, "target"),
      requiredMemberForbiddenResult(params, "result"),
      asReviewLootForbiddenLootFixture(params.loot),
    ),

    present: async ({ params }) => {
      await expect
        .poll(() =>
          reviewLootForbiddenLootPresent(
            requiredMemberForbiddenTarget(params, "target"),
            requiredMemberForbiddenLoot(params, "loot"),
            requiredMemberForbiddenResult(params, "result"),
          ),
        )
        .toBe(true);
    },

    absent: async ({ data }) => {
      await expect.poll(() => reviewLootForbiddenLootsAbsent(memberLootFixtures(data))).toBe(true);
    },
  },

  "db.member_review_loot_ledger": {
    delete_residue: async ({ data }) => {
      await deleteReviewLootForbiddenLedger(memberLedgerReasons(data));
    },

    absent: async ({ data }) => {
      await expect.poll(() => reviewLootForbiddenLedgerAbsent(memberLedgerReasons(data))).toBe(true);
    },
  },

  "page.member_review_loot_login": {
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

  "page.member_review_loot_target": {
    visible: async ({ ctx, data }) => {
      await expectReviewLootForbiddenTargetPanelsVisible(ctx.page, memberTargetFixtures(data));
    },

    review_action_absent: async ({ ctx, data }) => {
      await expectReviewLootActionsAbsent(ctx.page, memberTargetFixtures(data));
    },
  },

  "api.member_review_loot_workbench": {
    target_present: async ({ ctx, data }) => {
      await expect.poll(() => memberWorkbenchContainsTarget(ctx.page, data)).toBe(true);
    },
  },
} satisfies OperatorRegistry<TestContext, AdminReviewLootMemberForbiddenCaseData>;

function requiredMemberForbiddenTarget(params: StepParams, key: string): MemberForbiddenTarget {
  return requireMemberForbiddenTarget(params[key]);
}

function requiredMemberForbiddenResult(params: StepParams, key: string): MemberForbiddenResult {
  return requireMemberForbiddenResult(params[key]);
}

function requiredMemberForbiddenLoot(params: StepParams, key: string): MemberForbiddenLoot {
  return requireMemberForbiddenLoot(params[key]);
}
