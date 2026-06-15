import type { BrowserContext, Page } from "@playwright/test";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type LoginInvalidCredentialsRole = "member" | "admin";

export type LoginInvalidCredentialsCaseData = {
  email: string;
  password: string;
  wrongPassword: string;
  blankPassword: string;
  shortPassword: string;
  name: string;
  role: LoginInvalidCredentialsRole;
  invalidAccountNoAt: string;
  invalidAccountMissingDomain: string;
  invalidAccountMissingTopLevelDomain: string;
  invalidAccountWithSpace: string;
  nonexistentEmail: string;
};
