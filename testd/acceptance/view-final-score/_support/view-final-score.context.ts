import type { BrowserContext, Page } from "@playwright/test";
import type { ObjectiveFlowStatus, OrfStage } from "../../../../src/types/orf";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type ViewFinalScoreCaseData = {
  primaryEmail: string;
  primaryPassword: string;
  primaryName: string;
  otherEmail: string;
  otherPassword: string;
  otherName: string;
  memberRole: "member";
  cleanupEmails: string[];
  primaryMemberNames: string[];
  otherMemberNames: string[];
  primaryObjectiveId: string;
  primaryObjectiveTitle: string;
  otherObjectiveId: string;
  otherObjectiveTitle: string;
  primaryPoints: number;
  otherPoints: number;
  primaryLedgerId: string;
  otherLedgerId: string;
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
