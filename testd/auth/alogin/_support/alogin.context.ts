import type { BrowserContext, Page } from "@playwright/test";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type ALoginCaseData = {
  email: string;
  password: string;
  name: string;
  role: "admin";
};
