import type { BrowserContext, Page } from "@playwright/test";
import type {
  BountyHallData,
  TaskManagementData,
} from "../../../../server/repositories/orfRepository";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type ObjectivePublishMemberForbiddenCaseData = {
  email: string;
  password: string;
  name: string;
  role: "member";
  objectiveTitle: string;
};

export type MyChallengesResponse = {
  status: number;
  body: Partial<TaskManagementData>;
};

export type BountyHallResponse = {
  status: number;
  body: Partial<BountyHallData>;
};
