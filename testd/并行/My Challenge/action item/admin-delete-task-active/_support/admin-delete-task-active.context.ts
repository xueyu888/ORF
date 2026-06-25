import type { BrowserContext, Page } from "@playwright/test";
import type { ObjectiveFlowStatus, ObjectiveStatus, Priority, TaskStatus } from "../../../../../../src/types/orf";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type AdminDeleteTaskActiveCaseData = {
  adminEmail: string;
  adminPassword: string;
  adminName: string;
  adminRole: "admin";
  objectiveId: string;
  objectiveTitle: string;
  taskId: string;
  taskTitle: string;
  taskDescription: string;
  taskStatus: TaskStatus;
  taskPriority: Priority;
  subtaskId: string;
  subtaskLabel: string;
  objectiveStatus: ObjectiveStatus;
};

export type AdminDeleteTaskActiveTarget = {
  objective: {
    id: string;
    title: string;
    flowStatus: ObjectiveFlowStatus;
  };
};

export type AdminDeleteTaskActiveFixture = {
  id: string;
  title: string;
  description: string;
  assignee: string;
  linkedObjectiveId: string;
  status: TaskStatus;
  priority: Priority;
};

export type AdminDeleteTaskActiveSubtaskFixture = {
  id: string;
  taskId: string;
  label: string;
  done: boolean;
};
