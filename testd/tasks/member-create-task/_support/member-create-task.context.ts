import type { BrowserContext, Page } from "@playwright/test";
import type { ObjectiveFlowStatus, Priority, TaskStatus } from "../../../../src/types/orf";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type MemberCreateTaskCaseData = {
  email: string;
  password: string;
  name: string;
  role: "member";
  objectiveId: string;
  objectiveTitle: string;
  taskTitle: string;
  taskDescription: string;
  subtaskLabel: string;
};

export type MemberCreateTaskTarget = {
  objective: {
    id: string;
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
