import { expect } from "@playwright/test";
import type { OperatorRegistry, StepParams } from "../../_framework/types";
import { readBrowserSession } from "../../_operators/common.helpers";
import { requiredString } from "../../_operators/params";
import type {
  MemberSubmitLootPermissionForbiddenCaseData,
  PermissionForbiddenResult,
  PermissionForbiddenTarget,
  TestContext,
} from "./_support/member-submit-loot-permission-forbidden.context";
import {
  asLootForbiddenResultFixture,
  asLootForbiddenTargetFixture,
  asPermissionResult,
  asPermissionTarget,
  createLootForbiddenResult,
  deleteTestLoot,
  deleteLootForbiddenResults,
  deleteLootForbiddenTargets,
  expectLootForbiddenTargetPanelsAbsent,
  expectLootForbiddenTargetPanelsVisible,
  expectSubmitLootActionsAbsent,
  lootForbiddenResultPresent,
  lootForbiddenResultsAbsent,
  lootForbiddenTargetMatchesFixture,
  lootForbiddenTargetsAbsent,
  permissionMemberWorkbenchExcludesTarget,
  permissionResultFixtures,
  permissionTargetChallengers,
  permissionTargetFixtures,
  testLootAbsent,
  upsertLootForbiddenTarget,
} from "./_support/member-submit-loot-permission-forbidden.helpers";

export const memberSubmitLootPermissionForbiddenOperators = {
  "db.permission_loot_target": {
    delete_residue: async ({ data }) => {
      await deleteLootForbiddenTargets(permissionTargetFixtures(data));
    },

    upsert: async ({ data, params }) =>
      upsertLootForbiddenTarget({
        fixture: asLootForbiddenTargetFixture(params.fixture),
        teamId: requiredString(params, "teamId"),
        challengers: permissionTargetChallengers(data),
        createdBy: requiredString(params, "createdBy"),
        updatedBy: requiredString(params, "updatedBy"),
      }),

    ready_for_submission: async ({ data, params }) => {
      await expect
        .poll(() => lootForbiddenTargetMatchesFixture(asLootForbiddenTargetFixture(params.fixture), permissionTargetChallengers(data)))
        .toBe(true);
    },

    absent: async ({ data }) => {
      await expect.poll(() => lootForbiddenTargetsAbsent(permissionTargetFixtures(data))).toBe(true);
    },
  },

  "db.permission_loot_result": {
    delete_residue: async ({ data }) => {
      await deleteLootForbiddenResults(permissionResultFixtures(data));
    },

    create: async ({ params }) => createLootForbiddenResult(requiredPermissionTarget(params, "target"), asLootForbiddenResultFixture(params.result)),

    present: async ({ params }) => {
      await expect
        .poll(() => lootForbiddenResultPresent(requiredPermissionTarget(params, "target"), requiredPermissionResult(params, "result")))
        .toBe(true);
    },

    absent: async ({ data }) => {
      await expect.poll(() => lootForbiddenResultsAbsent(permissionResultFixtures(data))).toBe(true);
    },
  },

  "db.permission_loot": {
    delete: async ({ params }) => {
      await deleteTestLoot(requiredString(params, "body"));
    },

    absent: async ({ params }) => {
      await expect.poll(() => testLootAbsent(requiredString(params, "body"))).toBe(true);
    },
  },

  "page.permission_loot_target": {
    visible: async ({ ctx, data }) => {
      await expectLootForbiddenTargetPanelsVisible(ctx.page, permissionTargetFixtures(data));
    },

    absent: async ({ ctx, data }) => {
      await expectLootForbiddenTargetPanelsAbsent(ctx.page, permissionTargetFixtures(data));
    },

    submit_action_absent: async ({ ctx, data }) => {
      await expectSubmitLootActionsAbsent(ctx.page, permissionTargetFixtures(data));
    },
  },

  "page.permission_login": {
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

  "api.permission_member_workbench": {
    target_absent: async ({ ctx, data }) => {
      await expect.poll(() => permissionMemberWorkbenchExcludesTarget(ctx.page, data)).toBe(true);
    },
  },
} satisfies OperatorRegistry<TestContext, MemberSubmitLootPermissionForbiddenCaseData>;

function requiredPermissionTarget(params: StepParams, key: string): PermissionForbiddenTarget {
  return asPermissionTarget(params[key]);
}

function requiredPermissionResult(params: StepParams, key: string): PermissionForbiddenResult {
  return asPermissionResult(params[key]);
}
