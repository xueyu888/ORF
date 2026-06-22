import type { BrowserContext, Page } from "@playwright/test";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type SystemMembersDeleteUserData = {
  email: string;
  password: string;
  name: string;
  role: "admin" | "member";
};

export type SystemMembersDeleteCaseData = {
  admin: SystemMembersDeleteUserData & { role: "admin" };
  targetUser: SystemMembersDeleteUserData & { role: "member" };
  cancelUser: SystemMembersDeleteUserData & { role: "member" };
  defaultLandingPath: string;
  membersPath: string;
};
