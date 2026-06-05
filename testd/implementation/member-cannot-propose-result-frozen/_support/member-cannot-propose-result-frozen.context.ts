import type { BrowserContext, Page } from "@playwright/test";
import type { ObjectiveFlowStatus } from "../../../../src/types/orf";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type FrozenMemberProposalCaseData = {
  email: string;
  password: string;
  name: string;
  role: "member";
  objectiveId: string;
  objectiveTitle: string;
  resultTitle: string;
};

export interface FrozenProposalTarget {
  objective: {
    id: string;
    teamId: string;
    title: string;
    flowStatus: ObjectiveFlowStatus;
  };
}
