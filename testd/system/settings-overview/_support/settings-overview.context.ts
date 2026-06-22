import type { BrowserContext, Page } from "@playwright/test";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type SystemSettingsOverviewUserData = {
  email: string;
  password: string;
  name: string;
  role: "admin";
};

export type SystemSettingsOverviewCaseData = {
  admin: SystemSettingsOverviewUserData;
  defaultLandingPath: string;
  settingsPath: string;
};
