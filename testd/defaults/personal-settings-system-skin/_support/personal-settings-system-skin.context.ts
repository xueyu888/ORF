import type { BrowserContext, Page } from "@playwright/test";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type PersonalSettingsSystemSkinCaseData = {
  email: string;
  password: string;
  name: string;
  role: "member";
  status: "active";
  settingsPathPattern: string;
};
