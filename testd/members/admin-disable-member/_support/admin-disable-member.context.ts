import type { BrowserContext, Page } from "@playwright/test";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type AdminDisableMemberCaseData = {
  adminEmail: string;
  adminPassword: string;
  adminName: string;
  adminRole: "admin";
  memberUserId: string;
  memberName: string;
  memberEmail: string;
  memberRole: "member";
};
