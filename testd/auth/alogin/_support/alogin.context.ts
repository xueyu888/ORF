import type { BrowserContext, Page } from "@playwright/test";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type ALoginCaseData = {
  email: string;
  password: string;
  role: "admin";
};

export type AdminAccountRecord = {
  userId: string;
  email: string;
  role: "admin";
  status: string;
  lastOnlineAt: string | null;
};
