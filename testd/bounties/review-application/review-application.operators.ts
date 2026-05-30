import { expect, type Response } from "@playwright/test";
import type { OperatorRegistry, StepParams } from "../../_framework/types";
import type { CapturedResponse } from "../../_operators/common.context";
import { readResponseBody } from "../../_operators/common.helpers";
import { requiredCapturedResponse } from "../../_operators/common.operators";
import { requiredString } from "../../_operators/params";
import type { ReviewApplicationCaseData, ReviewApplicationTarget, TestContext } from "./_support/review-application.context";
import {
  applicationAbsent,
  applicationPill,
  applicationStatus,
  bountyHallHasAvailableTarget,
  bountyHallHasCurrentApplication,
  bountyRow,
  challengeApplicationDialog,
  createReviewTargetFromObjective,
  memberWorkbenchContainsObjective,
  memberWorkbenchMissingObjective,
  objectiveFlowStatus,
  objectiveHasChallenger,
  objectivePanel,
  objectiveStage,
} from "./_support/review-application.helpers";

const CAPTURED_RESPONSE_TIMEOUT_MS = 5_000;

export const reviewApplicationOperators = {
  "db.challenge_review": {
    target_from_objective: async ({ data, params }) =>
      createReviewTargetFromObjective({
        objectiveId: requiredString(params, "objectiveId"),
        objectiveTitle: requiredString(params, "objectiveTitle"),
        approveApplicantName: data.approveApplicantName,
        rejectApplicantName: data.rejectApplicantName,
      }),
  },

  "db.challenge_application": {
    absent: async ({ params }) => {
      await expect
        .poll(() => applicationAbsent(requiredReviewTarget(params, "target"), requiredString(params, "applicant")))
        .toBe(true);
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

    stage: async ({ params }) => {
      await expect.poll(() => objectiveStage(requiredReviewTarget(params, "target"))).toBe(requiredString(params, "stage"));
    },
  },

  "api.bounties": {
    target_available: async ({ ctx, params }) => {
      await expect.poll(() => bountyHallHasAvailableTarget(ctx.page, requiredReviewTarget(params, "target"))).toBe(true);
    },

    current_application: async ({ ctx, params }) => {
      await expect.poll(() => bountyHallHasCurrentApplication(ctx.page, requiredReviewTarget(params, "target"))).toBe(true);
    },
  },

  "api.my_challenges": {
    objective_present: async ({ ctx, params }) => {
      await expect.poll(() => memberWorkbenchContainsObjective(ctx.page, requiredReviewTarget(params, "target"))).toBe(true);
    },

    objective_absent: async ({ ctx, params }) => {
      await expect.poll(() => memberWorkbenchMissingObjective(ctx.page, requiredReviewTarget(params, "target"))).toBe(true);
    },
  },

  "api.challenge_application": {
    record_approve_application: async ({ params }) =>
      reviewTargetWithApplicationId(
        await requiredCapturedResponse(params, "response"),
        requiredReviewTarget(params, "target"),
        requiredString(params, "applicant"),
        "approveApplicationId",
      ),

    record_reject_application: async ({ params }) =>
      reviewTargetWithApplicationId(
        await requiredCapturedResponse(params, "response"),
        requiredReviewTarget(params, "target"),
        requiredString(params, "applicant"),
        "rejectApplicationId",
      ),
  },

  "api.challenge_review": {
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

  "page.bounty_row": {
    visible: async ({ ctx, params }) => {
      await expect(bountyRow(ctx.page, requiredReviewTarget(params, "target"))).toBeVisible();
    },

    apply_visible: async ({ ctx, params }) => {
      await expect(bountyRow(ctx.page, requiredReviewTarget(params, "target")).getByRole("button", { name: "申请挑战" })).toBeVisible();
    },

    apply: async ({ ctx, params }) => {
      await bountyRow(ctx.page, requiredReviewTarget(params, "target")).getByRole("button", { name: "申请挑战" }).click();
    },
  },

  "page.challenge_application_dialog": {
    visible: async ({ ctx }) => {
      await expect(challengeApplicationDialog(ctx.page)).toBeVisible();
    },

    confirm: async ({ ctx, params }) => {
      const target = requiredReviewTarget(params, "target");
      const responsePromise = ctx.page
        .waitForResponse(
          (response) =>
            response.request().method().toUpperCase() === "POST" &&
            response.url().endsWith(`/api/objectives/${encodeURIComponent(target.objective.id)}/challenge-applications`),
          { timeout: CAPTURED_RESPONSE_TIMEOUT_MS },
        )
        .then(toCapturedResponse);

      try {
        await challengeApplicationDialog(ctx.page).getByRole("button", { name: "申请挑战" }).click();
        return await responsePromise;
      } catch (error) {
        await responsePromise.catch(() => undefined);
        throw error;
      }
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
      const target = requiredReviewTarget(params, "target");
      const applicationId = requiredApplicationId(target, "approve");
      const responsePromise = captureReviewResponse(ctx.page, target, applicationId, "approve");

      try {
        await applicationPill(ctx.page, target, requiredString(params, "applicant")).getByRole("button", { name: "通过" }).click();
        return await responsePromise;
      } catch (error) {
        await responsePromise.catch(() => undefined);
        throw error;
      }
    },

    reject: async ({ ctx, params }) => {
      const target = requiredReviewTarget(params, "target");
      const applicationId = requiredApplicationId(target, "reject");
      const responsePromise = captureReviewResponse(ctx.page, target, applicationId, "reject");

      try {
        await applicationPill(ctx.page, target, requiredString(params, "applicant")).getByRole("button", { name: "拒绝" }).click();
        return await responsePromise;
      } catch (error) {
        await responsePromise.catch(() => undefined);
        throw error;
      }
    },
  },
} satisfies OperatorRegistry<TestContext, ReviewApplicationCaseData>;

function captureReviewResponse(page: TestContext["page"], target: ReviewApplicationTarget, applicationId: string, action: "approve" | "reject") {
  return page
    .waitForResponse(
      (response) => {
        return (
          response.request().method().toUpperCase() === "PATCH" &&
          response.url().endsWith(
            `/api/objectives/${encodeURIComponent(target.objective.id)}/challenge-applications/${encodeURIComponent(applicationId)}/${action}`,
          )
        );
      },
      { timeout: CAPTURED_RESPONSE_TIMEOUT_MS },
    )
    .then(toCapturedResponse);
}

async function toCapturedResponse(response: Response): Promise<CapturedResponse> {
  return {
    ok: response.ok(),
    status: response.status(),
    url: response.url(),
    method: response.request().method(),
    body: await readResponseBody(response),
  };
}

function reviewTargetWithApplicationId(
  response: CapturedResponse,
  target: ReviewApplicationTarget,
  applicant: string,
  applicationField: "approveApplicationId" | "rejectApplicationId",
): ReviewApplicationTarget {
  expect(response.ok).toBe(true);
  expect(response.status).toBe(200);
  expect(response.body).toMatchObject({
    objective: {
      id: target.objective.id,
    },
  });

  const applications = (response.body as { objective?: { challengeApplications?: unknown } } | null)?.objective?.challengeApplications;
  if (!Array.isArray(applications)) {
    throw new Error("创建挑战申请响应中缺少申请列表");
  }

  const application = applications.find(
    (item): item is { id: string; applicant: string; status: string } =>
      typeof item === "object" &&
      item !== null &&
      typeof (item as { id?: unknown }).id === "string" &&
      (item as { applicant?: unknown }).applicant === applicant &&
      (item as { status?: unknown }).status === "pending",
  );
  if (!application) {
    throw new Error(`创建挑战申请响应中缺少 ${applicant} 的 pending 申请`);
  }

  return {
    ...target,
    [applicationField]: application.id,
  };
}

function requiredApplicationId(target: ReviewApplicationTarget, action: "approve" | "reject") {
  const applicationId = action === "approve" ? target.approveApplicationId : target.rejectApplicationId;
  if (!applicationId) {
    throw new Error(`挑战申请审批目标缺少 ${action === "approve" ? "审批通过" : "审批拒绝"} 申请 ID`);
  }
  return applicationId;
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
    typeof (value as ReviewApplicationTarget).approveApplicantName !== "string" ||
    typeof (value as ReviewApplicationTarget).rejectApplicantName !== "string" ||
    typeof (value as ReviewApplicationTarget).previous !== "object"
  ) {
    throw new Error(`参数 ${key} 必须是挑战申请审批目标`);
  }
  return value as ReviewApplicationTarget;
}
