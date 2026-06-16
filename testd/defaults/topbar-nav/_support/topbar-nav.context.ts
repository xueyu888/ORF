import type { BrowserContext, Page } from "@playwright/test";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type TopbarNavCaseData = {
  email: string;
  password: string;
  name: string;
  role: "member";
  defaultLandingPath: string;
  homePath: string;
};
