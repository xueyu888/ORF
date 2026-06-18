import type { BrowserContext, Page } from "@playwright/test";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type SystemMembersFilterUserData = {
  email: string;
  password?: string;
  name: string;
  role: "admin" | "member";
};

export type SystemMembersFilterCaseData = {
  admin: SystemMembersFilterUserData & { role: "admin"; password: string };
  member: SystemMembersFilterUserData & { role: "member" };
  defaultLandingPath: string;
  membersPath: string;
  memberNameKeyword: string;
  missingKeyword: string;
};
