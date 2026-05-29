import type { BrowserContext, Page } from "@playwright/test";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type RegisterInvalidCredentialsCaseData = {
  name: string;
  role: "member";
  validPassword: string;
  blankPassword: string;
  shortPassword: string;
  invalidAccountNoAt: string;
  invalidAccountMissingDomain: string;
  invalidAccountMissingTopLevelDomain: string;
  invalidAccountWithSpace: string;
  existingEmail: string;
  existingPassword: string;
  existingName: string;
  invalidPasswordEmptyEmail: string;
  invalidPasswordBlankEmail: string;
  invalidPasswordShortEmail: string;
};
