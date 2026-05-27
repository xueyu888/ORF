import type { BrowserContext, Page } from "@playwright/test";
import type { ChallengeApplication, ObjectiveFlowStatus, OrfStage, WorkStatus } from "../../../../src/types/orf";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type FrozenAdminCreateResultCaseData = {
  email: string;
  password: string;
  role: "admin";
  resultTitle: string;
  metricName: string;
};

export type FrozenAdminResultTarget = {
  objective: {
    id: string;
    title: string;
  };
  previous: FrozenAdminResultTargetSnapshot;
};

export type FrozenAdminResultTargetSnapshot = {
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

export type RejectedResultCreateResponse = {
  ok: boolean;
  status: number;
  body: unknown;
};
