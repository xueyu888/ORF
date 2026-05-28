import type { Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "../../../../server/db/client";
import { objectives } from "../../../../server/db/schema";
import type { OrfStage } from "../../../../src/types/orf";
import type {
  ReviewApplicationAttemptResult,
  ReviewApplicationForbiddenTarget,
} from "./review-application-forbidden.context";
import {
  applicationStatus,
  createPendingApplication,
  createReviewTargetFromObjective,
  objectiveFlowStatus,
  objectiveHasChallenger,
} from "../../review-application/_support/review-application.helpers";

export {
  applicationStatus,
  objectiveFlowStatus,
  objectiveHasChallenger,
};

export async function createForbiddenReviewTarget(input: {
  objectiveId: string;
  objectiveTitle: string;
  applicationId: string;
  applicantName: string;
}): Promise<ReviewApplicationForbiddenTarget> {
  return createReviewTargetFromObjective({
    objectiveId: input.objectiveId,
    objectiveTitle: input.objectiveTitle,
    approveApplicationId: input.applicationId,
    rejectApplicationId: input.applicationId,
    approveApplicantName: input.applicantName,
    rejectApplicantName: input.applicantName,
  });
}

export async function createForbiddenPendingApplication(target: ReviewApplicationForbiddenTarget) {
  await createPendingApplication(target, target.approveApplicantName, target.approveApplicationId);
}

export async function objectiveStage(target: ReviewApplicationForbiddenTarget): Promise<OrfStage | null> {
  const [row] = await db
    .select({ stage: objectives.stage })
    .from(objectives)
    .where(eq(objectives.id, target.objective.id))
    .limit(1);

  return row?.stage ?? null;
}

export async function readForbiddenTarget(target: ReviewApplicationForbiddenTarget) {
  const [row] = await db
    .select({
      id: objectives.id,
      title: objectives.title,
      stage: objectives.stage,
      flowStatus: objectives.flowStatus,
      challengers: objectives.challengers,
      challengeApplications: objectives.challengeApplications,
    })
    .from(objectives)
    .where(eq(objectives.id, target.objective.id))
    .limit(1);

  if (!row) {
    throw new Error(`审批目标不存在: ${target.objective.id}`);
  }
  return row;
}

export async function attemptApproveApplicationAsCurrentUser(
  page: Page,
  target: ReviewApplicationForbiddenTarget,
): Promise<ReviewApplicationAttemptResult> {
  return page.evaluate(
    async ({ objectiveId, applicationId }) => {
      const response = await fetch(
        `/api/objectives/${encodeURIComponent(objectiveId)}/challenge-applications/${encodeURIComponent(applicationId)}/approve`,
        {
          method: "PATCH",
          credentials: "include",
        },
      );

      return {
        status: response.status,
        body: await response.json().catch(() => ({})),
      };
    },
    { objectiveId: target.objective.id, applicationId: target.approveApplicationId },
  );
}
