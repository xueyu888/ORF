import type { BrowserContext, Page } from "@playwright/test";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type FeedbackContentFillCaseData = {
  email: string;
  password: string;
  name: string;
  role: "admin";
  defaultLandingPath: string;
  homePath: string;
  createFeedbackPathPattern: string;
  title: string;
  description: string;
  owner: string;
  category: string;
  impactLabel: string;
  impactValue: string;
};
