import type { BrowserContext, Page } from "@playwright/test";
import type { ChallengeApplication, ObjectiveFlowStatus, OrfStage, WorkStatus } from "../../../../src/types/orf";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type AdminFreezeObjectiveCaseData = {
  email: string;
  password: string;
  role: "admin";
  freezeResultTitle: string;
  freezeMetricName: string;
};

export type AdminFreezeObjectiveTarget = {
  objective: {
    id: string;
    title: string;
  };
  previous: AdminFreezeObjectiveSnapshot;
};

export type AdminFreezeObjectiveSnapshot = {
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

export type FreezePrerequisiteResult = {
  id: string;
  objectiveId: string;
  title: string;
  metricName: string;
};

export type FrozenObjective = {
  id: string;
  title: string;
  stage: OrfStage;
  flowStatus: ObjectiveFlowStatus;
  confirmedAt?: string | null;
};
