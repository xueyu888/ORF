import type { BrowserContext, Page } from "@playwright/test";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type SystemMembersStatusUserData = {
  email: string;
  password: string;
  name: string;
  role: "admin" | "member";
};

export type SystemMembersStatusCaseData = {
  admin: SystemMembersStatusUserData & { role: "admin" };
  activeUser: SystemMembersStatusUserData & { role: "member" };
  disabledUser: SystemMembersStatusUserData & { role: "member" };
  cancelUser: SystemMembersStatusUserData & { role: "member" };
  defaultLandingPath: string;
  membersPath: string;
};
