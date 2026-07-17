import type { BrowserContext, Page } from "@playwright/test";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type AdminDeleteMemberUserCaseData = {
  adminEmail: string;
  adminName: string;
  adminPassword: string;
  memberEmail: string;
  memberName: string;
  memberPassword: string;
};
