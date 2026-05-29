import type { Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "../../../../server/db/client";
import { objectives } from "../../../../server/db/schema";
import type { TaskManagementData } from "../../../../server/repositories/orfRepository";
import type { ChallengeApplication, OrfStage } from "../../../../src/types/orf";
import type { ReviewApplicationForbiddenTarget } from "./review-application-forbidden.context";
import {
  applicationStatus,
  createReviewTargetFromObjective,
  memberWorkbenchMissingObjective,
  objectiveFlowStatus,
  objectiveHasChallenger,
} from "../../review-application/_support/review-application.helpers";

export {
  applicationStatus,
  memberWorkbenchMissingObjective,
  objectiveFlowStatus,
  objectiveHasChallenger,
};

export type MemberWorkbenchResponse = {
  status: number;
  body: Partial<TaskManagementData>;
};

export async function createForbiddenReviewTarget(input: {
  objectiveId: string;
  objectiveTitle: string;
  applicationId: string;
  applicantName: string;
}): Promise<ReviewApplicationForbiddenTarget> {
  const target = await createReviewTargetFromObjective({
    objectiveId: input.objectiveId,
    objectiveTitle: input.objectiveTitle,
    approveApplicantName: input.applicantName,
    rejectApplicantName: input.applicantName,
  });

  return {
    ...target,
    approveApplicationId: input.applicationId,
    rejectApplicationId: input.applicationId,
  };
}

export async function createForbiddenPendingApplication(target: ReviewApplicationForbiddenTarget) {
  if (!target.approveApplicationId) {
    throw new Error("审批反向用例缺少 pending 申请 ID");
  }

  const [row] = await db
    .select({ challengeApplications: objectives.challengeApplications })
    .from(objectives)
    .where(eq(objectives.id, target.objective.id))
    .limit(1);

  if (!row) {
    throw new Error(`审批目标不存在: ${target.objective.id}`);
  }

  const pendingApplication: ChallengeApplication = {
    id: target.approveApplicationId,
    applicant: target.approveApplicantName,
    status: "pending",
    createdAt: new Date().toISOString(),
    decidedAt: null,
    decidedBy: null,
  };

  await db
    .update(objectives)
    .set({
      challengeApplications: [
        pendingApplication,
        ...row.challengeApplications.filter((application) => application.id !== target.approveApplicationId),
      ],
      flowStatus: "applying",
    })
    .where(eq(objectives.id, target.objective.id));
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

export async function readMemberWorkbenchData(page: Page): Promise<MemberWorkbenchResponse> {
  return page.evaluate(async () => {
    const response = await fetch("/api/my-challenges?scope=mine", {
      credentials: "include",
    });
    return {
      status: response.status,
      body: await response.json().catch(() => ({})),
    };
  });
}
