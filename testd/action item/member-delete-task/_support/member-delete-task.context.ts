import type { BrowserContext, Page } from "@playwright/test";
import type { ObjectiveFlowStatus, ObjectiveStatus, Priority, TaskStatus } from "../../../../src/types/orf";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type MemberDeleteTaskCaseData = {
  memberEmail: string;
  memberPassword: string;
  memberName: string;
  memberRole: "member";
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

export type MemberDeleteTaskTarget = {
  objective: {
    id: string;
    title: string;
    flowStatus: ObjectiveFlowStatus;
  };
};

export type MemberDeleteTaskFixture = {
  id: string;
  title: string;
  description: string;
  assignee: string;
  linkedObjectiveId: string;
  status: TaskStatus;
  priority: Priority;
};

export type MemberDeleteSubtaskFixture = {
  id: string;
  taskId: string;
  label: string;
  done: boolean;
};
