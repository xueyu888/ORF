import type { BrowserContext, Page } from "@playwright/test";
import type { LootResultClaim, ObjectiveFlowStatus, OrfStage, ResultAcceptedResult } from "../../../../src/types/orf";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type AdminReviewLootCaseData = {
  adminEmail: string;
  adminPassword: string;
  adminName: string;
  adminRole: "admin";
  memberEmail: string;
  memberPassword: string;
  memberName: string;
  memberRole: "member";
  cleanupEmails: string[];
  objectiveId: string;
  objectiveTitle: string;
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
    teamId: string;
    title: string;
    stage: OrfStage;
    flowStatus: ObjectiveFlowStatus;
  };
};

export type ReviewLootResult = {
  id: string;
  objectiveId: string;
  title: string;
  points: number;
  acceptedResult?: ResultAcceptedResult;
};

export type ReviewLoot = {
  id: string;
  objectiveId: string;
  body: string;
  submittedBy: string;
  resultClaims: LootResultClaim[];
};
