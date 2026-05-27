import { expect } from "@playwright/test";
import type { OperatorRegistry, StepParams } from "../../_framework/types";
import { requiredCapturedResponse } from "../../_operators/common.operators";
import { readResponseBody } from "../../_operators/common.helpers";
import { requiredString } from "../../_operators/params";
import type { ReviewApplicationCaseData, ReviewApplicationTarget, TestContext } from "./_support/review-application.context";
import {
  applicationPill,
  applicationStatus,
  createPendingApplication,
  createReviewTargetFromObjective,
  objectiveFlowStatus,
  objectiveHasChallenger,
  objectivePanel,
} from "./_support/review-application.helpers";

export const reviewApplicationOperators = {
  "db.challenge_review": {
    target_from_objective: async ({ data, params }) =>
      createReviewTargetFromObjective({
        objectiveId: requiredString(params, "objectiveId"),
        objectiveTitle: requiredString(params, "objectiveTitle"),
        approveApplicationId: data.approveApplicationId,
        rejectApplicationId: data.rejectApplicationId,
        approveApplicantName: data.approveApplicantName,
        rejectApplicantName: data.rejectApplicantName,
      }),
  },

  "db.challenge_application": {
    create_pending_application: async ({ params }) => {
      await createPendingApplication(
        requiredReviewTarget(params, "target"),
        requiredString(params, "applicant"),
        requiredString(params, "applicationId"),
      );
    },

    status: async ({ params }) => {
      await expect
        .poll(() => applicationStatus(requiredReviewTarget(params, "target"), requiredString(params, "applicant")))
        .toBe(requiredString(params, "status"));
    },
  },

  "db.objective_challengers": {
    present: async ({ params }) => {
      await expect
        .poll(() => objectiveHasChallenger(requiredReviewTarget(params, "target"), requiredString(params, "applicant")))
        .toBe(true);
    },

    absent: async ({ params }) => {
      await expect
        .poll(() => objectiveHasChallenger(requiredReviewTarget(params, "target"), requiredString(params, "applicant")))
        .toBe(false);
    },
  },

  "db.objective": {
    flow_status: async ({ params }) => {
      await expect.poll(() => objectiveFlowStatus(requiredReviewTarget(params, "target"))).toBe(requiredString(params, "status"));
    },
  },

  "api.challenge_review": {
    capture_approve_response: async ({ ctx, runtime, params }) => {
      const target = requiredReviewTarget(params, "target");
      runtime.values[requiredString(params, "saveAs")] = captureReviewResponse(ctx, target, "approve");
    },

    capture_reject_response: async ({ ctx, runtime, params }) => {
      const target = requiredReviewTarget(params, "target");
      runtime.values[requiredString(params, "saveAs")] = captureReviewResponse(ctx, target, "reject");
    },

    response_ok: async ({ params }) => {
      const response = await requiredCapturedResponse(params, "response");
      const target = requiredReviewTarget(params, "target");
      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        objective: {
          id: target.objective.id,
        },
      });
    },
  },

  "page.challenge_review_target": {
    visible: async ({ ctx, params }) => {
      await expect(objectivePanel(ctx.page, requiredReviewTarget(params, "target"))).toBeVisible();
    },
  },

  "page.challenge_application": {
    approve_visible: async ({ ctx, params }) => {
      await expect(applicationPill(ctx.page, requiredReviewTarget(params, "target"), requiredString(params, "applicant")).getByRole("button", { name: "通过" })).toBeVisible();
    },

    reject_visible: async ({ ctx, params }) => {
      await expect(applicationPill(ctx.page, requiredReviewTarget(params, "target"), requiredString(params, "applicant")).getByRole("button", { name: "拒绝" })).toBeVisible();
    },

    approve: async ({ ctx, params }) => {
      await applicationPill(ctx.page, requiredReviewTarget(params, "target"), requiredString(params, "applicant")).getByRole("button", { name: "通过" }).click();
    },

    reject: async ({ ctx, params }) => {
      await applicationPill(ctx.page, requiredReviewTarget(params, "target"), requiredString(params, "applicant")).getByRole("button", { name: "拒绝" }).click();
    },
  },
} satisfies OperatorRegistry<TestContext, ReviewApplicationCaseData>;

function captureReviewResponse(ctx: TestContext, target: ReviewApplicationTarget, action: "approve" | "reject") {
  const applicationId = action === "approve" ? target.approveApplicationId : target.rejectApplicationId;
  return ctx.page
    .waitForResponse((response) => {
      return (
        response.request().method().toUpperCase() === "PATCH" &&
        response.url().endsWith(
          `/api/objectives/${encodeURIComponent(target.objective.id)}/challenge-applications/${encodeURIComponent(applicationId)}/${action}`,
        )
      );
    })
    .then(async (response) => ({
      ok: response.ok(),
      status: response.status(),
      url: response.url(),
      method: response.request().method(),
      body: await readResponseBody(response),
    }));
}

function requiredReviewTarget(params: StepParams, key: string): ReviewApplicationTarget {
  const value = params[key];
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as ReviewApplicationTarget).objective !== "object" ||
    (value as ReviewApplicationTarget).objective === null ||
    typeof (value as ReviewApplicationTarget).objective.id !== "string" ||
    typeof (value as ReviewApplicationTarget).objective.title !== "string" ||
    typeof (value as ReviewApplicationTarget).approveApplicationId !== "string" ||
    typeof (value as ReviewApplicationTarget).rejectApplicationId !== "string" ||
    typeof (value as ReviewApplicationTarget).previous !== "object"
  ) {
    throw new Error(`参数 ${key} 必须是挑战申请审批目标`);
  }
  return value as ReviewApplicationTarget;
}
