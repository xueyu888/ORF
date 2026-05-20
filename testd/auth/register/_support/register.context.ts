import type { BrowserContext, Page } from "@playwright/test";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type RegisterCaseData = {
  email: string;
  password: string;
  name: string;
  role: "member";
  adminEmail: string;
  adminPassword: string;
  adminRole: "admin";
};

export type RegisteredUserRecord = {
  id: string;
  name: string;
  email: string;
  status: string;
  role: string;
  teamId: string;
};
