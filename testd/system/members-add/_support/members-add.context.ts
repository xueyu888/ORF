import type { BrowserContext, Page } from "@playwright/test";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type SystemMembersAddUserData = {
  email: string;
  password?: string;
  name: string;
  role: "admin" | "member";
};

export type SystemMembersAddCaseData = {
  admin: SystemMembersAddUserData & { role: "admin"; password: string };
  existingUser: SystemMembersAddUserData & { role: "member" };
  createdUser: SystemMembersAddUserData & { role: "member" };
  emptyNameUser: SystemMembersAddUserData & { role: "member" };
  emptyEmailUser: Omit<SystemMembersAddUserData, "email"> & { role: "member" };
  invalidEmailUser: SystemMembersAddUserData & { role: "member" };
  duplicateUser: SystemMembersAddUserData & { role: "member" };
  cancelUser: SystemMembersAddUserData & { role: "member" };
  closeUser: SystemMembersAddUserData & { role: "admin" };
  defaultLandingPath: string;
  membersPath: string;
};
