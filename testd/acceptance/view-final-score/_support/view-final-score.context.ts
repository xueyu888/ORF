import type { BrowserContext, Page } from "@playwright/test";
import type { ObjectiveFlowStatus, OrfStage } from "../../../../src/types/orf";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type ViewFinalScoreCaseData = {
  email: string;
  password: string;
  name: string;
  role: "member";
  objectiveId: string;
  objectiveTitle: string;
  points: number;
  reason: string;
};

export type FinalScoreTarget = {
  objective: {
    id: string;
    teamId: string;
    title: string;
    stage: OrfStage;
    flowStatus: ObjectiveFlowStatus;
  };
};

export type FinalScoreLedger = {
  id: string;
  objectiveId: string;
  memberName: string;
  points: number;
  reason: string;
};
