import { expect } from "@playwright/test";
import type { OperatorRegistry, StepParams } from "../../_framework/types";
import { readBrowserSession } from "../../_operators/common.helpers";
import { requiredString } from "../../_operators/params";
import type {
  MemberSubmitPeerReviewPermissionForbiddenCaseData,
  PermissionForbiddenLoot,
  PermissionForbiddenTarget,
  TestContext,
} from "./_support/member-submit-peer-review-permission-forbidden.context";
import {
  asPeerReviewForbiddenTargetFixture,
  asPermissionLoot,
  asPermissionTarget,
  createPeerReviewForbiddenLoot,
  deletePeerReviewForbiddenLoots,
  deletePeerReviewForbiddenReviews,
  deletePeerReviewForbiddenTargets,
  expectPeerReviewForbiddenTargetPanelsAbsent,
  expectPeerReviewForbiddenTargetPanelsVisible,
  expectSubmitPeerReviewActionsAbsent,
  peerReviewForbiddenLootPresent,
  peerReviewForbiddenLootsAbsent,
  peerReviewForbiddenReviewsAbsent,
  peerReviewForbiddenTargetMatchesFixture,
  peerReviewForbiddenTargetsAbsent,
  permissionForbiddenReviewers,
  permissionLootFixtures,
  permissionMemberWorkbenchExcludesTarget,
  permissionTargetChallengers,
  permissionTargetFixtures,
  upsertPeerReviewForbiddenTarget,
} from "./_support/member-submit-peer-review-permission-forbidden.helpers";

export const memberSubmitPeerReviewPermissionForbiddenOperators = {
  "db.permission_peer_review_target": {
    delete_residue: async ({ data }) => {
      await deletePeerReviewForbiddenTargets(permissionTargetFixtures(data));
    },

    upsert: async ({ data, params }) =>
      upsertPeerReviewForbiddenTarget({
        fixture: asPeerReviewForbiddenTargetFixture(params.fixture),
        teamId: requiredString(params, "teamId"),
        challengers: permissionTargetChallengers(data),
        createdBy: requiredString(params, "createdBy"),
        updatedBy: requiredString(params, "updatedBy"),
      }),

    ready_for_peer_review: async ({ data, params }) => {
      await expect
        .poll(() => peerReviewForbiddenTargetMatchesFixture(asPeerReviewForbiddenTargetFixture(params.fixture), permissionTargetChallengers(data)))
        .toBe(true);
    },

    absent: async ({ data }) => {
      await expect.poll(() => peerReviewForbiddenTargetsAbsent(permissionTargetFixtures(data))).toBe(true);
    },
  },

  "db.permission_peer_review_loot": {
    delete_residue: async ({ data }) => {
      await deletePeerReviewForbiddenLoots(permissionLootFixtures(data));
    },

    create: async ({ params }) => createPeerReviewForbiddenLoot(requiredPermissionTarget(params, "target"), dataLootFixture(params)),

    present: async ({ params }) => {
      await expect
        .poll(() => peerReviewForbiddenLootPresent(requiredPermissionTarget(params, "target"), requiredPermissionLoot(params, "loot")))
        .toBe(true);
    },

    absent: async ({ data }) => {
      await expect.poll(() => peerReviewForbiddenLootsAbsent(permissionLootFixtures(data))).toBe(true);
    },
  },

  "db.permission_peer_review": {
    delete_residue: async ({ data }) => {
      await deletePeerReviewForbiddenReviews({
        targets: permissionTargetFixtures(data),
        reviewers: permissionForbiddenReviewers(data),
      });
    },

    absent: async ({ data }) => {
      await expect
        .poll(() =>
          peerReviewForbiddenReviewsAbsent({
            targets: permissionTargetFixtures(data),
            reviewers: permissionForbiddenReviewers(data),
          }),
        )
        .toBe(true);
    },
  },

  "page.permission_peer_review_target": {
    visible: async ({ ctx, data }) => {
      await expectPeerReviewForbiddenTargetPanelsVisible(ctx.page, permissionTargetFixtures(data));
    },

    absent: async ({ ctx, data }) => {
      await expectPeerReviewForbiddenTargetPanelsAbsent(ctx.page, permissionTargetFixtures(data));
    },

    submit_action_absent: async ({ ctx, data }) => {
      await expectSubmitPeerReviewActionsAbsent(ctx.page, permissionTargetFixtures(data));
    },
  },

  "page.permission_peer_review_login": {
    submit_admin: async ({ ctx, data }) => {
      await ctx.page.getByRole("button", { name: "Sign In" }).click();
      await expect
        .poll(() => readBrowserSession(ctx.page))
        .toMatchObject({
          status: 200,
          body: {
            authenticated: true,
            user: {
              email: data.adminEmail,
              role: data.adminRole,
              status: "active",
            },
          },
        });
    },

    submit_member: async ({ ctx, data }) => {
      await ctx.page.getByRole("button", { name: "Sign In" }).click();
      await expect
        .poll(() => readBrowserSession(ctx.page))
        .toMatchObject({
          status: 200,
          body: {
            authenticated: true,
            user: {
              email: data.memberEmail,
              role: data.memberRole,
              status: "active",
            },
          },
        });
    },
  },

  "api.permission_peer_review_member_workbench": {
    target_absent: async ({ ctx, data }) => {
      await expect.poll(() => permissionMemberWorkbenchExcludesTarget(ctx.page, data)).toBe(true);
    },
  },
} satisfies OperatorRegistry<TestContext, MemberSubmitPeerReviewPermissionForbiddenCaseData>;

function requiredPermissionTarget(params: StepParams, key: string): PermissionForbiddenTarget {
  return asPermissionTarget(params[key]);
}

function requiredPermissionLoot(params: StepParams, key: string): PermissionForbiddenLoot {
  return asPermissionLoot(params[key]);
}

function dataLootFixture(params: StepParams) {
  const value = params.loot;
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as { body?: unknown }).body !== "string" ||
    typeof (value as { submittedBy?: unknown }).submittedBy !== "string"
  ) {
    throw new Error("参数 loot 必须是提交匿名互评权限反向用例前置战利品配置");
  }
  return value as { body: string; submittedBy: string };
}
