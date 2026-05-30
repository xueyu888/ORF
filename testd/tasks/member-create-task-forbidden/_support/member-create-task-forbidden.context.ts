import type { BrowserContext, Page } from "@playwright/test";
import type { ObjectiveFlowStatus } from "../../../../src/types/orf";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type MemberCreateTaskForbiddenCaseData = {
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
  taskTitle: string;
  subtaskLabel: string;
};

export type MemberCreateTaskForbiddenTarget = {
  objective: {
    id: string;
    title: string;
    flowStatus: ObjectiveFlowStatus;
  };
};
