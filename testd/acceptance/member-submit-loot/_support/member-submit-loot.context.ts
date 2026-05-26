import type { BrowserContext, Page } from "@playwright/test";
import type {
  ChallengeApplication,
  LootResultClaim,
  ObjectiveAcceptedResult,
  ObjectiveFlowStatus,
  OrfStage,
  WorkStatus,
} from "../../../../src/types/orf";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type MemberSubmitLootCaseData = {
  email: string;
  password: string;
  name: string;
  role: "member";
  resultTitle: string;
  metricName: string;
  lootBody: string;
  evidenceText: string;
  selfTestReportBody: string;
  reportUrl: string;
};

export type LootTarget = {
  objective: {
    id: string;
    title: string;
  };
  previous: LootTargetSnapshot;
};

export type LootTargetSnapshot = {
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
  objectiveSettlementPoints: number | null;
  updatedAt: string;
  updatedBy: string | null;
};

export type LootPrerequisiteResult = {
  id: string;
  objectiveId: string;
  title: string;
  metricName: string;
};

export type SubmittedLoot = {
  id: string;
  objectiveId: string;
  submittedBy: string;
  body: string;
  resultClaims: LootResultClaim[];
  selfTestReportBody?: string | null;
};
