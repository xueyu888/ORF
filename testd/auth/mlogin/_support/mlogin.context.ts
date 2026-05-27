import type { BrowserContext, Page } from "@playwright/test";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type MloginCaseData = {
  email: string;
  password: string;
  name: string;
  role: "member";
};

export type MemberAccountRecord = {
  userId: string;
  email: string;
  role: "member";
  status: string | null;
  lastOnlineAt: string | null;
};
