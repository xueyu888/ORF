import type { BrowserContext, Page } from "@playwright/test";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type SidebarNavCaseData = {
  email: string;
  password: string;
  name: string;
  role: "member";
  defaultLandingPath: string;
  homePath: string;
};
