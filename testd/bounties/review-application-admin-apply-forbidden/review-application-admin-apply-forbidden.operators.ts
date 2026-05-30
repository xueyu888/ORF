import { expect } from "@playwright/test";
import type { OperatorRegistry, StepParams } from "../../_framework/types";
import { optionalString, requiredString } from "../../_operators/params";
import type {
  ReviewApplicationAdminApplyForbiddenCaseData,
  ReviewApplicationAdminApplyForbiddenTarget,
  TestContext,
} from "./_support/review-application-admin-apply-forbidden.context";
import {
  adminApplyBlockedDialog,
  adminBountyHallContainsTarget,
  adminBountyHallTargetHasNoCurrentApplication,
  applicationAbsent,
  bountyRow,
  objectiveFlowStatus,
  objectiveHasChallenger,
  objectiveStage,
  readAdminBountyHallData,
  upsertAdminApplyForbiddenTarget,
} from "./_support/review-application-admin-apply-forbidden.helpers";

export const reviewApplicationAdminApplyForbiddenOperators = {
  "db.admin_apply_forbidden_target": {
    upsert: async ({ params }) =>
      upsertAdminApplyForbiddenTarget({
        objectiveId: optionalString(params, "id"),
        objectiveTitle: requiredString(params, "title"),
        teamId: requiredString(params, "teamId"),
        adminName: requiredString(params, "adminName"),
        createdBy: optionalString(params, "createdBy"),
        updatedBy: optionalString(params, "updatedBy"),
      }),

    application_absent: async ({ params }) => {
      await expect
        .poll(() => applicationAbsent(requiredApplyTarget(params, "target"), requiredString(params, "applicant")))
        .toBe(true);
    },

    challenger_absent: async ({ params }) => {
      await expect
        .poll(() => objectiveHasChallenger(requiredApplyTarget(params, "target"), requiredString(params, "applicant")))
        .toBe(false);
    },

    flow_status: async ({ params }) => {
      await expect
        .poll(() => objectiveFlowStatus(requiredApplyTarget(params, "target")))
        .toBe(requiredString(params, "status"));
    },

    stage: async ({ params }) => {
      await expect
        .poll(() => objectiveStage(requiredApplyTarget(params, "target")))
        .toBe(requiredString(params, "stage"));
    },
  },

  "api.admin_bounties": {
    read: async ({ ctx }) => readAdminBountyHallData(ctx.page),

    objective_present: async ({ ctx, params }) => {
      await expect
        .poll(() => adminBountyHallContainsTarget(ctx.page, requiredApplyTarget(params, "target")))
        .toBe(true);
    },

    current_application_absent: async ({ ctx, params }) => {
      await expect
        .poll(() => adminBountyHallTargetHasNoCurrentApplication(ctx.page, requiredApplyTarget(params, "target")))
        .toBe(true);
    },
  },

  "page.admin_bounty_row": {
    apply_visible: async ({ ctx, params }) => {
      await expect(
        bountyRow(ctx.page, requiredApplyTarget(params, "target")).getByRole("button", { name: "申请挑战" }),
      ).toBeVisible();
    },

    apply: async ({ ctx, params }) => {
      await bountyRow(ctx.page, requiredApplyTarget(params, "target")).getByRole("button", { name: "申请挑战" }).click();
    },
  },

  "page.admin_apply_blocker": {
    visible: async ({ ctx }) => {
      await expect(adminApplyBlockedDialog(ctx.page)).toBeVisible();
    },

    acknowledge_visible: async ({ ctx }) => {
      await expect(adminApplyBlockedDialog(ctx.page).getByRole("button", { name: "我知道了" })).toBeVisible();
    },
  },
} satisfies OperatorRegistry<TestContext, ReviewApplicationAdminApplyForbiddenCaseData>;

function requiredApplyTarget(params: StepParams, key: string): ReviewApplicationAdminApplyForbiddenTarget {
  const value = params[key];
  if (!isApplyTarget(value)) {
    throw new Error(`参数 ${key} 必须是管理员申请挑战反向目标`);
  }
  return value;
}

function isApplyTarget(value: unknown): value is ReviewApplicationAdminApplyForbiddenTarget {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as ReviewApplicationAdminApplyForbiddenTarget).objective === "object" &&
    (value as ReviewApplicationAdminApplyForbiddenTarget).objective !== null &&
    typeof (value as ReviewApplicationAdminApplyForbiddenTarget).objective.id === "string" &&
    typeof (value as ReviewApplicationAdminApplyForbiddenTarget).objective.title === "string" &&
    typeof (value as ReviewApplicationAdminApplyForbiddenTarget).approveApplicantName === "string" &&
    typeof (value as ReviewApplicationAdminApplyForbiddenTarget).rejectApplicantName === "string" &&
    typeof (value as ReviewApplicationAdminApplyForbiddenTarget).previous === "object"
  );
}
