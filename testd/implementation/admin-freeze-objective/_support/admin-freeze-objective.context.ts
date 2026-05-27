import type { BrowserContext, Page } from "@playwright/test";
import type { ObjectiveFlowStatus, OrfStage } from "../../../../src/types/orf";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type AdminFreezeObjectiveCaseData = {
  email: string;
  password: string;
  name: string;
  role: "admin";
  objectiveId: string;
  objectiveTitle: string;
  freezeResultTitle: string;
  freezeMetricName: string;
};

export type AdminFreezeObjectiveTarget = {
  objective: {
    id: string;
    title: string;
    flowStatus: ObjectiveFlowStatus;
  };
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
