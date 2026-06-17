import type { BrowserContext, Page } from "@playwright/test";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type PersonalSettingsPreferencesCaseData = {
  email: string;
  password: string;
  name: string;
  role: "member";
  status: "active";
  settingsPathPattern: string;
  feedbackPathPattern: string;
  systemDefaultPathPattern: string;
  feedbackLandingPath: string;
};
