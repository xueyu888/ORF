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

export type ViewFinalScoreCaseData = {
  email: string;
  password: string;
  name: string;
  role: "member";
  points: number;
  reason: string;
};

export type FinalScoreTarget = {
  objective: {
    id: string;
    title: string;
  };
  previous: FinalScoreTargetSnapshot;
};

export type FinalScoreTargetSnapshot = {
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
  confirmedAt: string | null;
  lootSubmittedAt: string | null;
  acceptedResult: ObjectiveAcceptedResult | null;
  completionMultiplier: number | null;
  objectiveBasePoints: number;
  objectiveSettlementPoints: number | null;
  updatedAt: string;
  updatedBy: string | null;
};

export type FinalScoreLedger = {
  id: string;
  objectiveId: string;
  memberName: string;
  points: number;
  reason: string;
};
