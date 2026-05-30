import type { BrowserContext, Page } from "@playwright/test";
import type { BountyHallData } from "../../../../server/repositories/orfRepository";
import type { ReviewApplicationTarget } from "../../review-application/_support/review-application.context";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type ReviewApplicationAdminApplyForbiddenCaseData = {
  email: string;
  password: string;
  name: string;
  role: "admin";
  objectiveId: string;
  objectiveTitle: string;
};

export type ReviewApplicationAdminApplyForbiddenTarget = ReviewApplicationTarget;

export type AdminBountyHallResponse = {
  status: number;
  body: Partial<BountyHallData>;
};
