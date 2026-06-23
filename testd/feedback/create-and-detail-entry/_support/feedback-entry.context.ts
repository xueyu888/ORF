import type { BrowserContext, Page } from "@playwright/test";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type FeedbackEntryCaseData = {
  email: string;
  password: string;
  name: string;
  role: "admin";
  feedbackPath: string;
  feedbackCreatePathPattern: string;
  feedbackDetailPathPattern: string;
  feedbackId: string;
  phenomenon: string;
  category: string;
};
