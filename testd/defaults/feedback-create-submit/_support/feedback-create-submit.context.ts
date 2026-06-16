import type { BrowserContext, Page } from "@playwright/test";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type FeedbackCreateSubmitCaseData = {
  email: string;
  password: string;
  name: string;
  role: "admin";
  defaultLandingPath: string;
  homePath: string;
  createFeedbackPathPattern: string;
  feedbackDetailPathPattern: string;
  title: string;
  description: string;
  owner: string;
  category: string;
  initialImpactLabel: string;
  impactLabel: string;
  impactValue: string;
  requiredMessage: string;
};
