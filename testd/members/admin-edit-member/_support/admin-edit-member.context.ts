import type { BrowserContext, Page } from "@playwright/test";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type AdminEditMemberCaseData = {
  adminEmail: string;
  adminPassword: string;
  adminName: string;
  adminRole: "admin";
  targetUserId: string;
  originalName: string;
  originalEmail: string;
  originalRole: "member";
  updatedName: string;
  updatedEmail: string;
  updatedRole: "admin";
  targetEmails: string[];
};
