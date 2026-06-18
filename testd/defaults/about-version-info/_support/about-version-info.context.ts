import type { BrowserContext, Page } from "@playwright/test";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type AboutVersionInfoCaseData = {
  email: string;
  password: string;
  name: string;
  role: "member";
  status: "active";
  defaultLandingPath: string;
  homePath: string;
};
