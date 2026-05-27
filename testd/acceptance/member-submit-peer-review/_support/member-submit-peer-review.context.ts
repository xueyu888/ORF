import type { BrowserContext, Page } from "@playwright/test";
import type {
  ChallengeApplication,
  ContributionAllocation,
  ObjectiveAcceptedResult,
  ObjectiveFlowStatus,
  OrfStage,
  WorkStatus,
} from "../../../../src/types/orf";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type MemberSubmitPeerReviewCaseData = {
  email: string;
  password: string;
  name: string;
  role: "member";
  lootBody: string;
  ratio: string;
};

export type PeerReviewTarget = {
  objective: {
    id: string;
    title: string;
  };
  previous: PeerReviewTargetSnapshot;
};

export type PeerReviewTargetSnapshot = {
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
