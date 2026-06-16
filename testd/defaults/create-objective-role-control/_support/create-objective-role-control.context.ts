import type { BrowserContext, Page } from "@playwright/test";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type CreateObjectiveRoleControlCaseData = {
  admin: {
    email: string;
    password: string;
    name: string;
    role: "admin";
  };
  member: {
    email: string;
    password: string;
    name: string;
    role: "member";
  };
  defaultLandingPath: string;
  homePath: string;
  successTitle: string;
  emptyTitle: string;
  cancelledTitle: string;
};
