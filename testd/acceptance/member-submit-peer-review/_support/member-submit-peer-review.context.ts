import type { BrowserContext, Page } from "@playwright/test";
import type { ContributionAllocation, ObjectiveFlowStatus, OrfStage } from "../../../../src/types/orf";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type MemberSubmitPeerReviewCaseData = {
  email: string;
  password: string;
  name: string;
  role: "member";
  objectiveId: string;
  objectiveTitle: string;
  lootBody: string;
  ratio: string;
};

export type PeerReviewTarget = {
  objective: {
    id: string;
    teamId: string;
    title: string;
    stage: OrfStage;
    flowStatus: ObjectiveFlowStatus;
  };
};

export type PeerReviewLoot = {
  id: string;
  objectiveId: string;
  body: string;
};

export type SubmittedPeerReview = {
  id: string;
  objectiveId: string;
  reviewer: string;
  allocations: ContributionAllocation[];
};
