import type { Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "../../../_operators/testd-db-client";
import { objectives } from "../../../../server/db/schema";
import type { BountyHallData, TaskManagementData } from "../../../../server/repositories/orfRepository";
import type { ChallengeApplication, ObjectiveFlowStatus, OrfStage } from "../../../../src/types/orf";
import type { ReviewApplicationObjectiveSnapshot, ReviewApplicationTarget } from "./review-application.context";

export async function createReviewTargetFromObjective(input: {
  objectiveId: string;
  objectiveTitle: string;
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
    approveApplicantName: input.approveApplicantName,
    rejectApplicantName: input.rejectApplicantName,
    previous,
  };
}

export async function applicationStatus(target: ReviewApplicationTarget, applicant: string) {
  const objective = await readObjective(target.objective.id);
  return objective?.challengeApplications.find((application) => application.applicant === applicant)?.status ?? null;
}

export async function applicationAbsent(target: ReviewApplicationTarget, applicant: string) {
  const objective = await readObjective(target.objective.id);
  return !objective?.challengeApplications.some((application) => application.applicant === applicant);
}

export async function objectiveHasChallenger(target: ReviewApplicationTarget, applicant: string) {
  const objective = await readObjective(target.objective.id);
  return objective?.challengers.includes(applicant) ?? false;
}

export async function objectiveFlowStatus(target: ReviewApplicationTarget) {
  return (await readObjective(target.objective.id))?.flowStatus ?? null;
}

export async function objectiveStage(target: ReviewApplicationTarget) {
  return (await readObjective(target.objective.id))?.stage ?? null;
}

export async function bountyHallHasAvailableTarget(page: Page, target: ReviewApplicationTarget) {
  const response = await readBountyHall(page);
  if (response.status !== 200) {
    return false;
  }

  return response.body.availableItems.some((item) => {
    return (
      item.objective.id === target.objective.id &&
      item.objective.title === target.objective.title &&
      item.hasCurrentApplication === false &&
      item.isRecruitment === false
    );
  });
}

export async function bountyHallHasCurrentApplication(page: Page, target: ReviewApplicationTarget) {
  const response = await readBountyHall(page);
  if (response.status !== 200) {
    return false;
  }

  return response.body.availableItems.some((item) => item.objective.id === target.objective.id && item.hasCurrentApplication === true);
}

export async function memberWorkbenchContainsObjective(page: Page, target: ReviewApplicationTarget) {
  const response = await readMemberWorkbench(page);
  if (response.status !== 200) {
    return false;
  }

  return (response.body.objectives ?? []).some((objective) => objective.id === target.objective.id && objective.title === target.objective.title);
}

export async function memberWorkbenchMissingObjective(page: Page, target: ReviewApplicationTarget) {
  const response = await readMemberWorkbench(page);
  if (response.status !== 200) {
    return false;
  }

  return !(response.body.objectives ?? []).some((objective) => objective.id === target.objective.id && objective.title === target.objective.title);
}

export function objectivePanel(page: Page, target: ReviewApplicationTarget) {
  return page.locator("section.orf-objective-panel").filter({ hasText: target.objective.title }).first();
}

export function applicationPill(page: Page, target: ReviewApplicationTarget, applicant: string) {
  return objectivePanel(page, target).locator(".orf-objective-application-pill").filter({ hasText: applicant }).first();
}

export function bountyRow(page: Page, target: ReviewApplicationTarget) {
  return page.locator(".bounty-list-row").filter({ hasText: target.objective.title }).first();
}

export function challengeApplicationDialog(page: Page) {
  return page.getByRole("dialog").filter({ hasText: "提交后等待指挥官确认" }).first();
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

async function readObjective(objectiveId: string): Promise<{
  stage: OrfStage;
  flowStatus: ObjectiveFlowStatus;
  challengers: string[];
  challengeApplications: ChallengeApplication[];
} | null> {
  const [row] = await db
    .select({
      stage: objectives.stage,
      flowStatus: objectives.flowStatus,
      challengers: objectives.challengers,
      challengeApplications: objectives.challengeApplications,
    })
    .from(objectives)
    .where(eq(objectives.id, objectiveId))
    .limit(1);

  return row ?? null;
}

async function readBountyHall(page: Page): Promise<{ status: number; body: BountyHallData }> {
  return page.evaluate(async () => {
    const response = await fetch("/api/bounties", { credentials: "include" });
    return {
      status: response.status,
      body: await response.json(),
    };
  });
}

async function readMemberWorkbench(page: Page): Promise<{ status: number; body: Partial<TaskManagementData> }> {
  return page.evaluate(async () => {
    const response = await fetch("/api/my-challenges?scope=mine", { credentials: "include" });
    return {
      status: response.status,
      body: await response.json().catch(() => ({})),
    };
  });
}
