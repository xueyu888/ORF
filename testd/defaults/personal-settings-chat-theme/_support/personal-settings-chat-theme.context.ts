import type { BrowserContext, Page } from "@playwright/test";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type PersonalSettingsChatThemeCaseData = {
  email: string;
  password: string;
  name: string;
  role: "member";
  status: "active";
  settingsPathPattern: string;
  chatPathPattern: string;
};
