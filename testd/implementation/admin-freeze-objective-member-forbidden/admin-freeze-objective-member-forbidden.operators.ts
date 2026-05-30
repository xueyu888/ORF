import { expect } from "@playwright/test";
import type { OperatorRegistry, StepParams } from "../../_framework/types";
import { requiredString } from "../../_operators/params";
import type {
  AdminFreezeObjectiveMemberForbiddenCaseData,
  FreezePrerequisiteResult,
  MemberFreezeForbiddenTarget,
  TestContext,
} from "./_support/admin-freeze-objective-member-forbidden.context";
import {
  asFreezeForbiddenFixture,
  asFreezePrerequisiteResult,
  asMemberFreezeForbiddenTarget,
  createFreezePrerequisiteResult,
  deleteFreezeForbiddenTargets,
  deleteFreezePrerequisiteResult,
  expectFreezeForbiddenButtonsAbsent,
  expectFreezeForbiddenTargetPanelsVisible,
  freezeForbiddenTargetMatchesFixture,
  freezeForbiddenTargetsAbsent,
  freezeForbiddenTargetsHaveChallenger,
  freezeForbiddenTargetsMatchFixtures,
  memberFreezeFixtures,
  memberWorkbenchContainsAllTargets,
  targetResultPresent,
  testResultAbsent,
  upsertFreezeForbiddenTarget,
} from "./_support/admin-freeze-objective-member-forbidden.helpers";

export const adminFreezeObjectiveMemberForbiddenOperators = {
  "db.member_freeze_forbidden_targets": {
    delete_residue: async ({ data }) => {
      await deleteFreezeForbiddenTargets(memberFreezeFixtures(data));
    },

    upsert: async ({ params }) =>
      upsertFreezeForbiddenTarget({
        fixture: asFreezeForbiddenFixture(params.fixture),
        teamId: requiredString(params, "teamId"),
        challengerName: requiredString(params, "memberName"),
        createdBy: requiredString(params, "createdBy"),
        updatedBy: requiredString(params, "updatedBy"),
      }),

    state: async ({ params }) => {
      await expect
        .poll(() => freezeForbiddenTargetMatchesFixture(asFreezeForbiddenFixture(params.fixture)))
        .toBe(true);
    },

    all_states: async ({ data }) => {
      await expect.poll(() => freezeForbiddenTargetsMatchFixtures(memberFreezeFixtures(data))).toBe(true);
    },

    challenger_present: async ({ data, params }) => {
      await expect
        .poll(() => freezeForbiddenTargetsHaveChallenger(memberFreezeFixtures(data), requiredString(params, "memberName")))
        .toBe(true);
    },

    absent: async ({ data }) => {
      await expect.poll(() => freezeForbiddenTargetsAbsent(memberFreezeFixtures(data))).toBe(true);
    },
  },

  "db.freeze_result": {
    create: async ({ params }) => {
      return createFreezePrerequisiteResult(requiredFreezeTarget(params, "target"), {
        freezeResultTitle: requiredString(params, "title"),
        freezeMetricName: requiredString(params, "metricName"),
      });
    },

    present: async ({ params }) => {
      await expect
        .poll(() => targetResultPresent(requiredFreezeTarget(params, "target"), requiredFreezeResult(params, "result")))
        .toBe(true);
    },

    delete: async ({ params }) => {
      await deleteFreezePrerequisiteResult(requiredString(params, "title"), optionalFreezeResult(params, "result"));
    },
  },

  "db.result": {
    absent: async ({ params }) => {
      await expect.poll(() => testResultAbsent(requiredString(params, "title"))).toBe(true);
    },
  },

  "page.member_freeze_forbidden_targets": {
    visible: async ({ ctx, data }) => {
      await expectFreezeForbiddenTargetPanelsVisible(ctx.page, memberFreezeFixtures(data));
    },

    freeze_absent: async ({ ctx, data }) => {
      await expectFreezeForbiddenButtonsAbsent(ctx.page, memberFreezeFixtures(data));
    },
  },

  "api.member_workbench": {
    targets_present: async ({ ctx, data }) => {
      await expect.poll(() => memberWorkbenchContainsAllTargets(ctx.page, data)).toBe(true);
    },
  },
} satisfies OperatorRegistry<TestContext, AdminFreezeObjectiveMemberForbiddenCaseData>;

function requiredFreezeTarget(params: StepParams, key: string): MemberFreezeForbiddenTarget {
  return asMemberFreezeForbiddenTarget(params[key]);
}

function requiredFreezeResult(params: StepParams, key: string): FreezePrerequisiteResult {
  return asFreezePrerequisiteResult(params[key]);
}

function optionalFreezeResult(params: StepParams, key: string): FreezePrerequisiteResult | null {
  const value = params[key];
  if (value === undefined || value === null) {
    return null;
  }

  return asFreezePrerequisiteResult(value);
}
