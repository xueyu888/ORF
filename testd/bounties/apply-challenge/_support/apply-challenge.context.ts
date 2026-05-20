import type { BrowserContext, Page } from "@playwright/test";
import type { ChallengeApplication, ObjectiveFlowStatus } from "../../../../src/types/orf";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type ApplyChallengeCaseData = {
  email: string;
  password: string;
  name: string;
  role: "member";
};

export type BountyTarget = {
  objective: {
    id: string;
    title: string;
    flowStatus: ObjectiveFlowStatus;
    challengeApplications: ChallengeApplication[];
  };
  hasCurrentApplication: boolean;
  previousFlowStatus: ObjectiveFlowStatus;
};

export type BountyApplicationRecord = {
  id: string;
  applicant: string;
  status: string;
  createdAt?: string | null;
};
