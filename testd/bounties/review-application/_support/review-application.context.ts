import type { BrowserContext, Page } from "@playwright/test";
import type { ChallengeApplication, ObjectiveFlowStatus, OrfStage, WorkStatus } from "../../../../src/types/orf";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type ReviewApplicationCaseData = {
  email: string;
  password: string;
  role: "admin";
  approveApplicantName: string;
  rejectApplicantName: string;
};

export type ReviewApplicationTarget = {
  objective: {
    id: string;
    title: string;
  };
  approveApplicationId: string;
  rejectApplicationId: string;
  approveApplicantName: string;
  rejectApplicantName: string;
  previous: ReviewApplicationObjectiveSnapshot;
};

export type ReviewApplicationObjectiveSnapshot = {
  id: string;
  title: string;
  stage: OrfStage;
  flowStatus: ObjectiveFlowStatus;
  status: WorkStatus;
  challengers: string[];
  assignedChallengers: string[];
  challengeApplications: ChallengeApplication[];
  acceptedAt: string | null;
  confirmationDueAt: string | null;
  updatedAt: string;
  updatedBy: string | null;
};

