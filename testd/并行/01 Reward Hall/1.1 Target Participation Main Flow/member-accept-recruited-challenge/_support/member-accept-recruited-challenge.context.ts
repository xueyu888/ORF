import type { BrowserContext, Page } from "@playwright/test";
import type { ObjectiveFlowStatus, OrfStage, UserRole, UserStatus } from "../../../../../../src/types/orf";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type MemberAcceptRecruitedChallengeCaseData = {
  adminEmail: string;
  adminPassword: string;
  adminName: string;
  adminRole: Extract<UserRole, "admin">;
  adminStatus: Extract<UserStatus, "active">;
  memberEmail: string;
  memberPassword: string;
  memberName: string;
  memberRole: Extract<UserRole, "member">;
  memberStatus: Extract<UserStatus, "active">;
  projectName: string;
  objectiveTitle: string;
};

export type AcceptRecruitedProject = {
  id: string;
  name: string;
  teamId: string;
};

export type AcceptRecruitedObjective = {
  id: string;
  title: string;
  flowStatus: ObjectiveFlowStatus;
  stage: OrfStage;
  projectId: string | null;
  publishedAt: string | null;
  assignedChallengers: string[];
  assignedChallengerUserIds: string[];
  challengers: string[];
  challengerUserIds: string[];
};
