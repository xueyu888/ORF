import type { BrowserContext, Page } from "@playwright/test";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type FeedbackImageUploadCaseData = {
  email: string;
  password: string;
  name: string;
  role: "admin";
  defaultLandingPath: string;
  homePath: string;
  createFeedbackPathPattern: string;
  validImageFileName: string;
  textAttachmentFileName: string;
};
