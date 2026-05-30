import { expect } from "@playwright/test";
import type { OperatorRegistry, StepParams } from "../../_framework/types";
import { requiredString } from "../../_operators/params";
import type {
  ReviewApplicationForbiddenCaseData,
  ReviewApplicationForbiddenTarget,
  TestContext,
} from "./_support/review-application-forbidden.context";
import {
  applicationStatus,
  createForbiddenPendingApplication,
  createForbiddenReviewTarget,
  memberWorkbenchMissingObjective,
  objectiveFlowStatus,
  objectiveHasChallenger,
  objectiveStage,
  readMemberWorkbenchData,
  readForbiddenTarget,
} from "./_support/review-application-forbidden.helpers";

export const reviewApplicationForbiddenOperators = {
  "db.review_forbidden_target": {
    create_pending_application: async ({ params }) => {
      const target = await createForbiddenReviewTarget({
        objectiveId: requiredString(params, "objectiveId"),
        objectiveTitle: requiredString(params, "objectiveTitle"),
        applicationId: requiredString(params, "applicationId"),
        applicantName: requiredString(params, "applicant"),
      });
      await createForbiddenPendingApplication(target);
      return target;
    },

    read: async ({ params }) => readForbiddenTarget(requiredReviewTarget(params, "target")),

    application_status: async ({ params }) => {
      await expect
        .poll(() => applicationStatus(requiredReviewTarget(params, "target"), requiredString(params, "applicant")))
        .toBe(requiredString(params, "status"));
    },

    challenger_absent: async ({ params }) => {
      await expect
        .poll(() => objectiveHasChallenger(requiredReviewTarget(params, "target"), requiredString(params, "applicant")))
        .toBe(false);
    },

    flow_status: async ({ params }) => {
      await expect
        .poll(() => objectiveFlowStatus(requiredReviewTarget(params, "target")))
        .toBe(requiredString(params, "status"));
    },

    stage: async ({ params }) => {
      await expect
        .poll(() => objectiveStage(requiredReviewTarget(params, "target")))
        .toBe(requiredString(params, "stage"));
    },
  },

  "api.member_workbench": {
    read: async ({ ctx }) => readMemberWorkbenchData(ctx.page),

    objective_absent: async ({ ctx, params }) => {
      await expect
        .poll(() => memberWorkbenchMissingObjective(ctx.page, requiredReviewTarget(params, "target")))
        .toBe(true);
    },
  },
} satisfies OperatorRegistry<TestContext, ReviewApplicationForbiddenCaseData>;

function requiredReviewTarget(params: StepParams, key: string): ReviewApplicationForbiddenTarget {
  const value = params[key];
  if (!isReviewTarget(value)) {
    throw new Error(`参数 ${key} 必须是挑战申请审批目标`);
  }
  return value;
}

function isReviewTarget(value: unknown): value is ReviewApplicationForbiddenTarget {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as ReviewApplicationForbiddenTarget).objective === "object" &&
    (value as ReviewApplicationForbiddenTarget).objective !== null &&
    typeof (value as ReviewApplicationForbiddenTarget).objective.id === "string" &&
    typeof (value as ReviewApplicationForbiddenTarget).objective.title === "string" &&
    typeof (value as ReviewApplicationForbiddenTarget).approveApplicationId === "string" &&
    typeof (value as ReviewApplicationForbiddenTarget).approveApplicantName === "string"
  );
}
