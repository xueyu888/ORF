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

export type MemberScoreStatisticsCaseData = {
  adminEmail: string;
  adminPassword: string;
  adminRole: "admin";
  firstMemberName: string;
  firstMemberPoints: number;
  secondMemberName: string;
  secondMemberPoints: number;
  reason: string;
};

export type ScoreStatisticsTarget = {
  objective: {
    id: string;
    title: string;
  };
  previous: ScoreStatisticsTargetSnapshot;
};

export type ScoreStatisticsTargetSnapshot = {
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

export type ScoreLedgerInput = {
  memberName: string;
  points: number;
};
