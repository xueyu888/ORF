import type { BrowserContext, Page } from "@playwright/test";
import type {
  ChallengeApplication,
  ObjectiveAcceptedResult,
  ObjectiveFlowStatus,
  OrfStage,
  WorkStatus,
} from "../../../../src/types/orf";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type AdminReviewLootCaseData = {
  adminEmail: string;
  adminPassword: string;
  adminRole: "admin";
  memberName: string;
  resultTitle: string;
  metricName: string;
  lootBody: string;
  evidenceText: string;
  points: number;
  reason: string;
};

export type ReviewLootTarget = {
  objective: {
    id: string;
    title: string;
  };
  previous: ReviewLootTargetSnapshot;
};

export type ReviewLootTargetSnapshot = {
  id: string;
  title: string;
  finalDueAt: string;
  stage: OrfStage;
  flowStatus: ObjectiveFlowStatus;
  status: WorkStatus;
  challengers: string[];
  assignedChallengers: string[];
  challengeApplications: ChallengeApplication[];
  acceptedAt: string | null;
  confirmationDueAt: string | null;
  confirmedAt: string | null;
  lootSubmittedAt: string | null;
  acceptedResult: ObjectiveAcceptedResult | null;
  completionMultiplier: number | null;
  objectiveBasePoints: number;
  objectiveSettlementPoints: number | null;
  updatedAt: string;
  updatedBy: string | null;
};

export type ReviewLootResult = {
  id: string;
  objectiveId: string;
  title: string;
};

export type ReviewLoot = {
  id: string;
  objectiveId: string;
  body: string;
};
