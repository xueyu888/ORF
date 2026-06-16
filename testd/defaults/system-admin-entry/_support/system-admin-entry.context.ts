import type { BrowserContext, Page } from "@playwright/test";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type SystemAdminEntryUserData = {
  email: string;
  password: string;
  name: string;
  role: "admin" | "member";
};

export type SystemAdminEntryCaseData = {
  admin: SystemAdminEntryUserData & { role: "admin" };
  member: SystemAdminEntryUserData & { role: "member" };
  defaultLandingPath: string;
  homePath: string;
};
