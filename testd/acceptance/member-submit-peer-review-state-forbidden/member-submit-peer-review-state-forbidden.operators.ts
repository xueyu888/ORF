import { expect } from "@playwright/test";
import type { OperatorRegistry, StateCaseRuntime, StepParams } from "../../_framework/types";
import { readBrowserSession } from "../../_operators/common.helpers";
import { requiredString } from "../../_operators/params";
import type {
  MemberSubmitPeerReviewStateForbiddenCaseData,
  StateForbiddenTarget,
  TestContext,
} from "./_support/member-submit-peer-review-state-forbidden.context";
import {
  asPeerReviewForbiddenLootFixture,
  asPeerReviewForbiddenTargetFixture,
  asStateLoot,
  asStateTarget,
  createPeerReviewForbiddenLoot,
  deletePeerReviewForbiddenLoots,
  deletePeerReviewForbiddenReviews,
  deletePeerReviewForbiddenTargets,
  expectPeerReviewForbiddenTargetPanelsVisible,
  expectSubmitPeerReviewActionsAbsent,
  peerReviewForbiddenLootsAbsent,
  peerReviewForbiddenLootsPresent,
  peerReviewForbiddenReviewsAbsent,
  peerReviewForbiddenTargetsAbsent,
  peerReviewForbiddenTargetsMatchFixtures,
  stateForbiddenReviewers,
  stateLootFixtures,
  stateMemberWorkbenchContainsTargets,
  stateTargetChallengers,
  stateTargetChallengersByTargetId,
  stateTargetFixtures,
  upsertPeerReviewForbiddenTarget,
} from "./_support/member-submit-peer-review-state-forbidden.helpers";

export const memberSubmitPeerReviewStateForbiddenOperators = {
  "db.state_peer_review_target": {
    delete_residue: async ({ data }) => {
      await deletePeerReviewForbiddenTargets(stateTargetFixtures(data));
    },

    upsert: async ({ data, params }) =>
      upsertPeerReviewForbiddenTarget({
        fixture: asPeerReviewForbiddenTargetFixture(params.fixture),
        teamId: requiredString(params, "teamId"),
        challengers: stateTargetChallengers(data),
        createdBy: requiredString(params, "createdBy"),
        updatedBy: requiredString(params, "updatedBy"),
      }),

    states: async ({ data }) => {
      await expect
        .poll(() => peerReviewForbiddenTargetsMatchFixtures(stateTargetFixtures(data), stateTargetChallengersByTargetId(data)))
        .toBe(true);
    },

    absent: async ({ data }) => {
      await expect.poll(() => peerReviewForbiddenTargetsAbsent(stateTargetFixtures(data))).toBe(true);
    },
  },

  "db.state_peer_review_loot": {
    delete_residue: async ({ data }) => {
      await deletePeerReviewForbiddenLoots(stateLootFixtures(data));
    },

    create: async ({ params }) => createPeerReviewForbiddenLoot(requiredStateTarget(params, "target"), asPeerReviewForbiddenLootFixture(params.loot)),

    all_present: async ({ runtime }) => {
      await expect.poll(() => peerReviewForbiddenLootsPresent(stateLootPairsFromRuntime(runtime))).toBe(true);
    },

    absent: async ({ data }) => {
      await expect.poll(() => peerReviewForbiddenLootsAbsent(stateLootFixtures(data))).toBe(true);
    },
  },

  "db.state_peer_review": {
    delete_residue: async ({ data }) => {
      await deletePeerReviewForbiddenReviews({
        targets: stateTargetFixtures(data),
        reviewers: stateForbiddenReviewers(data),
      });
    },

    absent: async ({ data }) => {
      await expect
        .poll(() =>
          peerReviewForbiddenReviewsAbsent({
            targets: stateTargetFixtures(data),
            reviewers: stateForbiddenReviewers(data),
          }),
        )
        .toBe(true);
    },
  },

  "page.state_peer_review_targets": {
    visible: async ({ ctx, data }) => {
      await expectPeerReviewForbiddenTargetPanelsVisible(ctx.page, stateTargetFixtures(data));
    },

    submit_action_absent: async ({ ctx, data }) => {
      await expectSubmitPeerReviewActionsAbsent(ctx.page, stateTargetFixtures(data));
    },
  },

  "page.state_peer_review_login": {
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

  "api.state_peer_review_member_workbench": {
    targets_present: async ({ ctx, data }) => {
      await expect.poll(() => stateMemberWorkbenchContainsTargets(ctx.page, data)).toBe(true);
    },
  },
} satisfies OperatorRegistry<TestContext, MemberSubmitPeerReviewStateForbiddenCaseData>;

function requiredStateTarget(params: StepParams, key: string): StateForbiddenTarget {
  return asStateTarget(params[key]);
}

function stateLootPairsFromRuntime(runtime: StateCaseRuntime) {
  return [
    {
      target: asStateTarget(runtime.values.submittedTarget),
      loot: asStateLoot(runtime.values.submittedLoot),
    },
    {
      target: asStateTarget(runtime.values.settledTarget),
      loot: asStateLoot(runtime.values.settledLoot),
    },
  ];
}
