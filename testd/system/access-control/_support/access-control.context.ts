import type { BrowserContext, Page } from "@playwright/test";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type SystemAccessControlUserData = {
  email: string;
  password: string;
  name: string;
  role: "admin" | "member";
};

export type SystemAccessControlCaseData = {
  admin: SystemAccessControlUserData & { role: "admin" };
  member: SystemAccessControlUserData & { role: "member" };
  defaultLandingPath: string;
  homePath: string;
  systemPath: string;
};
