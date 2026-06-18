import type { BrowserContext, Page } from "@playwright/test";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type AboutUpdateStatusCaseData = {
  currentVersion: string;
  email: string;
  homePath: string;
  latestVersion: string;
  name: string;
  newVersion: string;
  password: string;
  role: "member";
  status: "active";
};
