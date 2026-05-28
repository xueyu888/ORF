import type { BrowserContext, Page } from "@playwright/test";
import type { TaskManagementData } from "../../../../server/repositories/orfRepository";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type ObjectiveCreateForbiddenCaseData = {
  email: string;
  password: string;
  name: string;
  role: "member";
  objectiveTitle: string;
};

export type ApiAttemptResult = {
  status: number;
  body: unknown;
};

export type MyChallengesResponse = {
  status: number;
  body: Partial<TaskManagementData>;
};
