import type { BrowserContext, Page } from "@playwright/test";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type SystemMembersOverviewUserData = {
  email: string;
  password?: string;
  name: string;
  role: "admin" | "member";
};

export type SystemMembersOverviewCaseData = {
  admin: SystemMembersOverviewUserData & { role: "admin"; password: string };
  member: SystemMembersOverviewUserData & { role: "member" };
  defaultLandingPath: string;
  membersPath: string;
  expectedSearchPlaceholder: string;
  minUserCount: number;
  minRoleCount: number;
};
