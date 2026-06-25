import type { BrowserContext, Page } from "@playwright/test";
import type { ObjectiveFlowStatus, ObjectiveStatus, Priority, TaskStatus } from "../../../../../../src/types/orf";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type MemberDeleteTaskActiveForbiddenCaseData = {
  forbiddenEmail: string;
  forbiddenPassword: string;
  forbiddenName: string;
  forbiddenRole: "member";
  challengerEmail: string;
  challengerPassword: string;
  challengerName: string;
  challengerRole: "member";
  objectiveId: string;
  objectiveTitle: string;
  taskId: string;
  taskTitle: string;
  taskDescription: string;
  subtaskId: string;
  subtaskLabel: string;
  taskStatus: TaskStatus;
  taskPriority: Priority;
  objectiveStatus: ObjectiveStatus;
};

export type MemberDeleteTaskActiveForbiddenTarget = {
  objective: {
    id: string;
    title: string;
    flowStatus: ObjectiveFlowStatus;
  };
};

export type MemberDeleteTaskActiveForbiddenFixture = {
  id: string;
  title: string;
  description: string;
  assignee: string;
  linkedObjectiveId: string;
  status: TaskStatus;
  priority: Priority;
};

export type MemberDeleteTaskActiveForbiddenSubtaskFixture = {
  id: string;
  taskId: string;
  label: string;
  done: boolean;
};
