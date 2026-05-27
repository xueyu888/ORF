import type { BrowserContext, Page } from "@playwright/test";
import type { ObjectiveFlowStatus } from "../../../../src/types/orf";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type FrozenAdminCreateResultCaseData = {
  email: string;
  password: string;
  name: string;
  role: "admin";
  objectiveId: string;
  objectiveTitle: string;
  resultTitle: string;
  metricName: string;
};

export type FrozenAdminResultTarget = {
  objective: {
    id: string;
    title: string;
    flowStatus: ObjectiveFlowStatus;
  };
};

export type RejectedResultCreateResponse = {
  ok: boolean;
  status: number;
  body: unknown;
};
