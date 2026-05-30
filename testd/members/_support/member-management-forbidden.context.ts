import type { BrowserContext, Page } from "@playwright/test";

export type MemberManagementForbiddenTestContext = {
  context: BrowserContext;
  page: Page;
};

export type MemberManagementForbiddenCaseData = {
  memberEmail: string;
  memberPassword: string;
  memberName: string;
  memberRole: "member";
  targetUserId: string;
  targetName: string;
  targetEmail: string;
  targetRole: "member";
  targetStatus: "active";
};
