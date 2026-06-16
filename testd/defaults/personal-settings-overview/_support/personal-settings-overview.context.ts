import type { BrowserContext, Page } from "@playwright/test";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type PersonalSettingsOverviewCaseData = {
  email: string;
  password: string;
  name: string;
  role: "member";
  status: "active";
  roleLabel: string;
  defaultLandingPath: string;
  homePath: string;
  settingsPathPattern: string;
};
