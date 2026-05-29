import type { BrowserContext, Page } from "@playwright/test";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type AdminDeleteMemberReferencedForbiddenCaseData = {
  adminEmail: string;
  adminPassword: string;
  adminName: string;
  adminRole: "admin";
  targetUserId: string;
  targetName: string;
  targetEmail: string;
  targetRole: "member";
  targetStatus: "active";
  objectiveId: string;
  objectiveTitle: string;
};
