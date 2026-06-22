import type { BrowserContext, Page } from "@playwright/test";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type SystemMembersReviewUserData = {
  email: string;
  password: string;
  name: string;
  role: "admin" | "member";
};

export type SystemMembersReviewCaseData = {
  admin: SystemMembersReviewUserData & { role: "admin" };
  approveUser: SystemMembersReviewUserData & { role: "member" };
  rejectUser: SystemMembersReviewUserData & { role: "member" };
  cancelUser: SystemMembersReviewUserData & { role: "member" };
  defaultLandingPath: string;
  membersPath: string;
};
