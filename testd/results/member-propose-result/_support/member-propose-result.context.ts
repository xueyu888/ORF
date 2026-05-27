import type { BrowserContext, Page } from "@playwright/test";
import type { BountySource, ChallengeApplication, ObjectiveFlowStatus, OrfStage, WorkStatus } from "../../../../src/types/orf";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type MemberProposeResultCaseData = {
  email: string;
  password: string;
  name: string;
  role: "member";
  resultTitle: string;
  metricName: string;
};

export type MemberProposeResultTarget = {
  objective: {
    id: string;
    title: string;
  };
  previous: MemberProposeObjectiveSnapshot;
};

export type MemberProposeObjectiveSnapshot = {
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
  updatedAt: string;
  updatedBy: string | null;
};

export type MemberProposedResult = {
  id: string;
  objectiveId: string;
  title: string;
  metricName: string;
  source?: BountySource;
  definer?: string;
};
