import type { BrowserContext, Page } from "@playwright/test";
import type { BountyHallData, TaskManagementData } from "../../../../server/repositories/orfRepository";
import type { ChallengeApplication, ObjectiveFlowStatus, OrfStage, WorkStatus } from "../../../../src/types/orf";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type RecruitMemberCaseData = {
  email: string;
  password: string;
  name: string;
  role: "admin";
  memberEmail: string;
  memberPassword: string;
  memberName: string;
  memberRole: "member";
  objectiveId: string;
  objectiveTitle: string;
};

export type RecruitMemberTarget = {
  id: string;
  title: string;
  stage: OrfStage;
  flowStatus: ObjectiveFlowStatus;
  status: WorkStatus;
  challengers: string[];
  assignedChallengers: string[];
  challengeApplications: ChallengeApplication[];
  acceptedAt?: string | null;
  confirmationDueAt?: string | null;
};

export type RecruitMemberDbSnapshot = RecruitMemberTarget & {
  acceptedAt: string | null;
  confirmationDueAt: string | null;
};

export type MyChallengesResponse = {
  status: number;
  body: Partial<TaskManagementData>;
};

export type BountyHallResponse = {
  status: number;
  body: Partial<BountyHallData>;
};
