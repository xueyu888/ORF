import type { BrowserContext, Page } from "@playwright/test";
import type { ObjectiveFlowStatus, Priority, TaskStatus } from "../../../../src/types/orf";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type MemberCreateTaskCaseData = {
  adminEmail: string;
  adminPassword: string;
  adminName: string;
  adminRole: "admin";
  memberEmail: string;
  memberPassword: string;
  memberName: string;
  memberRole: "member";
  cleanupEmails: string[];
  objectiveId: string;
  objectiveTitle: string;
  adminTaskTitle: string;
  memberTaskTitle: string;
  taskDescription: string;
  adminSubtaskLabel: string;
  memberSubtaskLabel: string;
};

export type MemberCreateTaskTarget = {
  objective: {
    id: string;
    teamId: string;
    title: string;
    flowStatus: ObjectiveFlowStatus;
  };
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
