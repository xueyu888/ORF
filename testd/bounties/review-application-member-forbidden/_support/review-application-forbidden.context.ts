import type { BrowserContext, Page } from "@playwright/test";
import type { ReviewApplicationTarget } from "../../review-application/_support/review-application.context";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type ReviewApplicationForbiddenCaseData = {
  email: string;
  password: string;
  name: string;
  role: "member";
  applicantEmail: string;
  applicantPassword: string;
  applicantName: string;
  applicantRole: "member";
  objectiveId: string;
  objectiveTitle: string;
  applicationId: string;
};

export type ReviewApplicationForbiddenTarget = ReviewApplicationTarget;
