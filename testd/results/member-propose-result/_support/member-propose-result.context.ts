import type { BrowserContext, Page } from "@playwright/test";
import type { BountySource, ObjectiveFlowStatus } from "../../../../src/types/orf";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type MemberProposeResultCaseData = {
  email: string;
  password: string;
  name: string;
  role: "member";
  objectiveId: string;
  objectiveTitle: string;
  resultTitle: string;
};

export type MemberProposeResultTarget = {
  objective: {
    id: string;
    teamId: string;
    title: string;
    flowStatus: ObjectiveFlowStatus;
  };
};

export type MemberProposedResult = {
  id: string;
  objectiveId: string;
  title: string;
  detail: string;
  source?: BountySource;
  definer?: string;
};
