import type { BrowserContext, Page } from "@playwright/test";
import type { BountyHallData, TaskManagementData } from "../../../../server/repositories/orfRepository";
import type { Objective, ObjectiveFlowStatus, OrfStage, WorkStatus } from "../../../../src/types/orf";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type ObjectivePublishCaseData = {
  email: string;
  password: string;
  name: string;
  role: "admin";
  memberEmail: string;
  memberPassword: string;
  memberName: string;
  memberRole: "member";
  objectiveTitle: string;
};

export type ObjectivePublishTarget = Objective;

export type ObjectivePublishDbSnapshot = {
  id: string;
  title: string;
  stage: OrfStage;
  flowStatus: ObjectiveFlowStatus;
  status: WorkStatus;
  challengers: string[];
  assignedChallengers: string[];
  challengeApplications: Objective["challengeApplications"];
};

export type MyChallengesResponse = {
  status: number;
  body: Partial<TaskManagementData>;
};

export type BountyHallResponse = {
  status: number;
  body: Partial<BountyHallData>;
};
