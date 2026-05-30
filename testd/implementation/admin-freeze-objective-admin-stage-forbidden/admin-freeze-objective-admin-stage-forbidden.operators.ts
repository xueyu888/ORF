import { expect } from "@playwright/test";
import type { OperatorRegistry, StepParams } from "../../_framework/types";
import { requiredString } from "../../_operators/params";
import type {
  AdminFreezeObjectiveAdminStageForbiddenCaseData,
  AdminStageForbiddenTarget,
  FreezePrerequisiteResult,
  TestContext,
} from "./_support/admin-freeze-objective-admin-stage-forbidden.context";
import {
  adminStageForbiddenFixtures,
  adminStageForbiddenResults,
  adminWorkbenchContainsAllTargets,
  asAdminStageForbiddenTarget,
  asFreezeForbiddenFixture,
  asFreezePrerequisiteResult,
  asFreezePrerequisiteResultInput,
  createFreezePrerequisiteResult,
  deleteFreezeForbiddenTargets,
  deleteFreezePrerequisiteResult,
  expectFreezeForbiddenButtonsAbsent,
  expectFreezeForbiddenTargetPanelsVisible,
  freezeForbiddenTargetMatchesFixture,
  freezeForbiddenTargetsAbsent,
  freezeForbiddenTargetsMatchFixtures,
  targetResultPresent,
  testResultAbsent,
  upsertFreezeForbiddenTarget,
} from "./_support/admin-freeze-objective-admin-stage-forbidden.helpers";

export const adminFreezeObjectiveAdminStageForbiddenOperators = {
  "db.admin_stage_forbidden_targets": {
    delete_residue: async ({ data }) => {
      await deleteFreezeForbiddenTargets(adminStageForbiddenFixtures(data));
    },

    upsert: async ({ params }) =>
      upsertFreezeForbiddenTarget({
        fixture: asFreezeForbiddenFixture(params.fixture),
        teamId: requiredString(params, "teamId"),
        createdBy: requiredString(params, "createdBy"),
        updatedBy: requiredString(params, "updatedBy"),
      }),

    state: async ({ params }) => {
      await expect
        .poll(() => freezeForbiddenTargetMatchesFixture(asFreezeForbiddenFixture(params.fixture)))
        .toBe(true);
    },

    all_states: async ({ data }) => {
      await expect.poll(() => freezeForbiddenTargetsMatchFixtures(adminStageForbiddenFixtures(data))).toBe(true);
    },

    absent: async ({ data }) => {
      await expect.poll(() => freezeForbiddenTargetsAbsent(adminStageForbiddenFixtures(data))).toBe(true);
    },
  },

  "db.admin_stage_forbidden_results": {
    delete_residue: async ({ data }) => {
      for (const result of adminStageForbiddenResults(data)) {
        await deleteFreezePrerequisiteResult(result.title);
      }
    },

    create: async ({ params }) => {
      const input = asFreezePrerequisiteResultInput(params.result);
      return createFreezePrerequisiteResult(requiredFreezeTarget(params, "target"), {
        freezeResultTitle: input.title,
        freezeMetricName: input.metricName,
      });
    },

    present: async ({ params }) => {
      await expect
        .poll(() => targetResultPresent(requiredFreezeTarget(params, "target"), requiredFreezeResult(params, "result")))
        .toBe(true);
    },

    absent: async ({ data }) => {
      await expect
        .poll(async () => {
          for (const result of adminStageForbiddenResults(data)) {
            if (!(await testResultAbsent(result.title))) {
              return false;
            }
          }
          return true;
        })
        .toBe(true);
    },
  },

  "page.admin_stage_forbidden_targets": {
    visible: async ({ ctx, data }) => {
      await expectFreezeForbiddenTargetPanelsVisible(ctx.page, adminStageForbiddenFixtures(data));
    },

    freeze_absent: async ({ ctx, data }) => {
      await expectFreezeForbiddenButtonsAbsent(ctx.page, adminStageForbiddenFixtures(data));
    },
  },

  "api.admin_workbench": {
    targets_present: async ({ ctx, data }) => {
      await expect.poll(() => adminWorkbenchContainsAllTargets(ctx.page, data)).toBe(true);
    },
  },
} satisfies OperatorRegistry<TestContext, AdminFreezeObjectiveAdminStageForbiddenCaseData>;

function requiredFreezeTarget(params: StepParams, key: string): AdminStageForbiddenTarget {
  return asAdminStageForbiddenTarget(params[key]);
}

function requiredFreezeResult(params: StepParams, key: string): FreezePrerequisiteResult {
  return asFreezePrerequisiteResult(params[key]);
}
