import type { BrowserContext, Page } from "@playwright/test";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type SystemMembersListUserData = {
  email: string;
  password?: string;
  name: string;
  role: "admin" | "member";
};

export type SystemMembersListCaseData = {
  admin: SystemMembersListUserData & { role: "admin"; password: string };
  member: SystemMembersListUserData & { role: "member" };
  defaultLandingPath: string;
  membersPath: string;
  expectedMemberRoleLabel: string;
  expectedMemberStatusLabel: string;
};
