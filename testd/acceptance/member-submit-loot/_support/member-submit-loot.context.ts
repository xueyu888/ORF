import type { BrowserContext, Page } from "@playwright/test";
import type { LootResultClaim, ObjectiveFlowStatus, OrfStage } from "../../../../src/types/orf";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type MemberSubmitLootCaseData = {
  email: string;
  password: string;
  name: string;
  role: "member";
  objectiveId: string;
  objectiveTitle: string;
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
    teamId: string;
    title: string;
    stage: OrfStage;
    flowStatus: ObjectiveFlowStatus;
  };
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
