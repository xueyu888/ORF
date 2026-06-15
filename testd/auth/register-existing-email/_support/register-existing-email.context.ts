import type { BrowserContext, Page } from "@playwright/test";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type RegisterExistingEmailCaseData = {
  existingEmail: string;
  existingPassword: string;
  existingName: string;
  duplicateName: string;
  role: "member";
  validPassword: string;
};
