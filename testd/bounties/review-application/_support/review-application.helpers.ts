import type { Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "../../../../server/db/client";
import { objectives } from "../../../../server/db/schema";
import type { ChallengeApplication, ObjectiveFlowStatus } from "../../../../src/types/orf";
import type { ReviewApplicationObjectiveSnapshot, ReviewApplicationTarget } from "./review-application.context";

export async function createReviewTargetFromObjective(input: {
  objectiveId: string;
  objectiveTitle: string;
  approveApplicationId: string;
  rejectApplicationId: string;
  approveApplicantName: string;
  rejectApplicantName: string;
}): Promise<ReviewApplicationTarget> {
  const previous = await readObjectiveSnapshot(input.objectiveId);
  if (!previous) {
    throw new Error(`挑战申请审批目标不存在: ${input.objectiveId}`);
  }

  return {
    objective: {
      id: input.objectiveId,
      title: input.objectiveTitle,
    },
    approveApplicationId: input.approveApplicationId,
    rejectApplicationId: input.rejectApplicationId,
    approveApplicantName: input.approveApplicantName,
    rejectApplicantName: input.rejectApplicantName,
    previous,
  };
}

export async function createPendingApplication(target: ReviewApplicationTarget, applicant: string, applicationId: string) {
  const objective = await readObjectiveWithApplications(target.objective.id);
  if (!objective) {
    throw new Error("目标不存在，无法创建待审批挑战申请");
  }

  const now = new Date().toISOString();
  const previousApplications = objective.challengeApplications.filter(
    (application) => application.id !== applicationId && application.applicant !== applicant,
  );
  const nextApplications: ChallengeApplication[] = [
    {
      id: applicationId,
      applicant,
      status: "pending",
      createdAt: now,
      decidedAt: null,
    },
    ...previousApplications,
  ];

  await db
    .update(objectives)
    .set({
      challengeApplications: nextApplications,
      flowStatus: target.previous.flowStatus === "recruiting" || target.previous.flowStatus === "reestimating"
        ? target.previous.flowStatus
        : "applying",
      updatedAt: today(),
    })
    .where(eq(objectives.id, target.objective.id));
}

export async function applicationStatus(target: ReviewApplicationTarget, applicant: string) {
  const objective = await readObjective(target.objective.id);
  return objective?.challengeApplications.find((application) => application.applicant === applicant)?.status ?? null;
}

export async function objectiveHasChallenger(target: ReviewApplicationTarget, applicant: string) {
  const objective = await readObjective(target.objective.id);
  return objective?.challengers.includes(applicant) ?? false;
}

export async function objectiveFlowStatus(target: ReviewApplicationTarget) {
  return (await readObjective(target.objective.id))?.flowStatus ?? null;
}

export function objectivePanel(page: Page, target: ReviewApplicationTarget) {
  return page.locator("section.orf-objective-panel").filter({ hasText: target.objective.title }).first();
}

export function applicationPill(page: Page, target: ReviewApplicationTarget, applicant: string) {
  return objectivePanel(page, target).locator(".orf-objective-application-pill").filter({ hasText: applicant }).first();
}

async function readObjectiveSnapshot(objectiveId: string): Promise<ReviewApplicationObjectiveSnapshot | null> {
  const [row] = await db
    .select({
      id: objectives.id,
      title: objectives.title,
      stage: objectives.stage,
      flowStatus: objectives.flowStatus,
      status: objectives.status,
      challengers: objectives.challengers,
      assignedChallengers: objectives.assignedChallengers,
      challengeApplications: objectives.challengeApplications,
      acceptedAt: objectives.acceptedAt,
      confirmationDueAt: objectives.confirmationDueAt,
      updatedAt: objectives.updatedAt,
      updatedBy: objectives.updatedBy,
    })
    .from(objectives)
    .where(eq(objectives.id, objectiveId))
    .limit(1);

  return row ?? null;
}

async function readObjectiveWithApplications(objectiveId: string): Promise<{
  flowStatus: ObjectiveFlowStatus;
  challengeApplications: ChallengeApplication[];
} | null> {
  const [row] = await db
    .select({
      flowStatus: objectives.flowStatus,
      challengeApplications: objectives.challengeApplications,
    })
    .from(objectives)
    .where(eq(objectives.id, objectiveId))
    .limit(1);

  return row ?? null;
}

async function readObjective(objectiveId: string): Promise<{
  flowStatus: ObjectiveFlowStatus;
  challengers: string[];
  challengeApplications: ChallengeApplication[];
} | null> {
  const [row] = await db
    .select({
      flowStatus: objectives.flowStatus,
      challengers: objectives.challengers,
      challengeApplications: objectives.challengeApplications,
    })
    .from(objectives)
    .where(eq(objectives.id, objectiveId))
    .limit(1);

  return row ?? null;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}
