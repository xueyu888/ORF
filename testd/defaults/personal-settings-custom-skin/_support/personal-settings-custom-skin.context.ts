import type { BrowserContext, Page } from "@playwright/test";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type PersonalSettingsCustomSkinCaseData = {
  email: string;
  password: string;
  name: string;
  role: "member";
  status: "active";
  settingsPathPattern: string;
  validSkinFileName: string;
  secondValidSkinFileName: string;
  invalidSkinFileName: string;
  invalidSkinMessage: string;
};
