import type { BrowserContext, Page } from "@playwright/test";
import type { BountySource, ObjectiveFlowStatus } from "../../../../src/types/orf";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type AdminCreateResultCaseData = {
  email: string;
  password: string;
  name: string;
  role: "admin";
  objectiveId: string;
  objectiveTitle: string;
  resultTitle: string;
};

export type AdminCreateResultTarget = {
  objective: {
    id: string;
    title: string;
    flowStatus: ObjectiveFlowStatus;
  };
};

export type AdminCreatedResult = {
  id: string;
  objectiveId: string;
  title: string;
  detail: string;
  source?: BountySource;
  definer?: string;
};
