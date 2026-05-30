import type { Page } from "@playwright/test";
import type {
  AdminBountyHallResponse,
  ReviewApplicationAdminApplyForbiddenTarget,
} from "./review-application-admin-apply-forbidden.context";
import { upsertTestObjective } from "../../../_operators/common.helpers";
import {
  applicationAbsent,
  bountyRow,
  createReviewTargetFromObjective,
  objectiveFlowStatus,
  objectiveHasChallenger,
  objectiveStage,
} from "../../review-application/_support/review-application.helpers";

export {
  applicationAbsent,
  bountyRow,
  objectiveFlowStatus,
  objectiveHasChallenger,
  objectiveStage,
};

export async function createAdminApplyForbiddenTarget(input: {
  objectiveId: string;
  objectiveTitle: string;
  adminName: string;
}): Promise<ReviewApplicationAdminApplyForbiddenTarget> {
  return createReviewTargetFromObjective({
    objectiveId: input.objectiveId,
    objectiveTitle: input.objectiveTitle,
    approveApplicantName: input.adminName,
    rejectApplicantName: input.adminName,
  });
}

export async function upsertAdminApplyForbiddenTarget(input: {
  objectiveId?: string;
  objectiveTitle: string;
  teamId: string;
  adminName: string;
  createdBy?: string;
  updatedBy?: string;
}): Promise<ReviewApplicationAdminApplyForbiddenTarget> {
  const objective = await upsertTestObjective({
    id: input.objectiveId,
    title: input.objectiveTitle,
    teamId: input.teamId,
    stage: "resultClaiming",
    flowStatus: "open",
    status: "Draft",
    createdBy: input.createdBy,
    updatedBy: input.updatedBy,
  });

  return createAdminApplyForbiddenTarget({
    objectiveId: objective.id,
    objectiveTitle: objective.title,
    adminName: input.adminName,
  });
}

export async function readAdminBountyHallData(page: Page): Promise<AdminBountyHallResponse> {
  return page.evaluate(async () => {
    const response = await fetch("/api/bounties", { credentials: "include" });
    return {
      status: response.status,
      body: await response.json().catch(() => ({})),
    };
  });
}

export async function adminBountyHallContainsTarget(page: Page, target: ReviewApplicationAdminApplyForbiddenTarget) {
  const response = await readAdminBountyHallData(page);
  if (response.status !== 200) {
    return false;
  }

  return (response.body.availableItems ?? []).some(
    (item) => item.objective.id === target.objective.id && item.objective.title === target.objective.title,
  );
}

export async function adminBountyHallTargetHasNoCurrentApplication(page: Page, target: ReviewApplicationAdminApplyForbiddenTarget) {
  const response = await readAdminBountyHallData(page);
  if (response.status !== 200) {
    return false;
  }

  const item = (response.body.availableItems ?? []).find((entry) => entry.objective.id === target.objective.id);
  return Boolean(item && item.hasCurrentApplication === false && item.isRecruitment === false);
}

export function adminApplyBlockedDialog(page: Page) {
  return page.getByRole("dialog", { name: "指挥官不应该申请挑战" });
}
