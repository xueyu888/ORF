import type { BrowserContext, Page } from "@playwright/test";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type SystemMembersEditUserData = {
  email: string;
  password?: string;
  name: string;
  role: "admin" | "member";
};

export type SystemMembersEditCaseData = {
  admin: SystemMembersEditUserData & { role: "admin"; password: string };
  sourceUser: SystemMembersEditUserData & { role: "member" };
  updatedUser: SystemMembersEditUserData & { role: "admin" };
  existingUser: SystemMembersEditUserData & { role: "member" };
  cancelUser: SystemMembersEditUserData & { role: "member" };
  closeUser: SystemMembersEditUserData & { role: "member" };
  invalidEmailName: string;
  defaultLandingPath: string;
  membersPath: string;
};
