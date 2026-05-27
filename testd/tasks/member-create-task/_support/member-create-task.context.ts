import type { BrowserContext, Page } from "@playwright/test";
import type { ChallengeApplication, ObjectiveFlowStatus, OrfStage, Priority, TaskStatus, WorkStatus } from "../../../../src/types/orf";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type MemberCreateTaskCaseData = {
  email: string;
  password: string;
  name: string;
  role: "member";
  taskTitle: string;
  taskDescription: string;
  subtaskLabel: string;
};

export type MemberCreateTaskTarget = {
  objective: {
    id: string;
    title: string;
  };
  previous: MemberCreateTaskObjectiveSnapshot;
};

export type MemberCreateTaskObjectiveSnapshot = {
  id: string;
  title: string;
  stage: OrfStage;
  flowStatus: ObjectiveFlowStatus;
  status: WorkStatus;
  challengers: string[];
  assignedChallengers: string[];
  challengeApplications: ChallengeApplication[];
  updatedAt: string;
  updatedBy: string | null;
};

export type MemberCreatedTask = {
  id: string;
  title: string;
  description: string;
  assignee: string;
  linkedObjectiveId: string;
  status: TaskStatus;
  priority: Priority;
};

export type MemberCreatedSubtask = {
  id: string;
  taskId: string;
  label: string;
  done: boolean;
};
