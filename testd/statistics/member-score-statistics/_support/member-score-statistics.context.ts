import type { BrowserContext, Page } from "@playwright/test";
import type { ObjectiveFlowStatus, OrfStage } from "../../../../src/types/orf";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type MemberScoreStatisticsCaseData = {
  adminEmail: string;
  adminPassword: string;
  adminName: string;
  adminRole: "admin";
  firstMemberEmail: string;
  firstMemberPassword: string;
  firstMemberName: string;
  firstMemberRole: "member";
  firstMemberPoints: number;
  secondMemberEmail: string;
  secondMemberPassword: string;
  secondMemberName: string;
  secondMemberRole: "member";
  secondMemberPoints: number;
  objectiveId: string;
  objectiveTitle: string;
  reason: string;
};

export type ScoreStatisticsTarget = {
  objective: {
    id: string;
    teamId: string;
    title: string;
    stage: OrfStage;
    flowStatus: ObjectiveFlowStatus;
  };
};

export type ScoreLedgerInput = {
  userId: string;
  memberName: string;
  points: number;
};
